import {
  CanvasTexture,
  FrontSide,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  type ColorRepresentation,
  type Material,
  type Side,
  type Texture,
} from "three";

import { KRAFT_INK_TINT } from "../render/compose";
import type { MaterialKind } from "../template/schema";

export type ProductMaterials = {
  /** The unprinted parts: wall, rim, bottom, inside, hem and handles. */
  base: Material;
  /** The artwork of one print area on this stock, always front-side; every call makes a new material. */
  print(texture: CanvasTexture): Material;
  /**
   * The base stock drawn on one face only, for the two sides of a single-sheet panel (the base
   * itself when it already draws only that side). Built on first use.
   */
  onlySide(side: Side): Material;
  /** Releases the base, every print and side material and the stock's own texture; print textures stay the caller's. */
  dispose(): void;
};

/** `side` is the base material's: a bag's single sheets are double-sided. Print materials are always front-side. */
export type MaterialOptions = { side?: Side };

const PAPER_ROUGHNESS = 0.85;
const KRAFT_ROUGHNESS = 0.9;
const KRAFT_BUMP_SCALE = 0.5;
const PET = { transmission: 0.9, roughness: 0.15, ior: 1.45, thickness: 1 };

/** How the stock looks unprinted; the shaded colours are written as HSL, the print itself is data. */
const STOCK_COLOR = {
  paper: "hsl(45, 20%, 96%)",
  kraftBrown: KRAFT_INK_TINT,
  kraftWhite: "hsl(40, 25%, 87%)",
} as const;

/**
 * The colour to paint under the artwork of an opaque stock's print texture: the print material
 * multiplies its map, so a pixel left transparent would show black. It is the base material's own
 * colour, so the band meets the unprinted wall without a seam. `null` where none is needed: kraft
 * brown (`compose` multiplies the whole print area onto kraft) and PET (the decal stays clear).
 */
export function printUnderlay(kind: MaterialKind): string | null {
  switch (kind) {
    case "paper-white":
      return STOCK_COLOR.paper;
    case "kraft-white":
      return STOCK_COLOR.kraftWhite;
    case "kraft":
    case "kraft-brown":
    case "pet-clear":
      return null;
  }
}

const FIBRE_SIZE = 256;
const FIBRE_COUNT = 700;
const FIBRE_REPEAT = 4;
const FIBRE_SEED = 20240611;
const SHADOW_SIZE = 128;

type Stock =
  | { type: "paper"; color: ColorRepresentation }
  | { type: "kraft"; color: ColorRepresentation }
  | { type: "pet" };

const STOCKS: Record<MaterialKind, Stock> = {
  "paper-white": { type: "paper", color: STOCK_COLOR.paper },
  kraft: { type: "kraft", color: STOCK_COLOR.kraftBrown },
  "kraft-brown": { type: "kraft", color: STOCK_COLOR.kraftBrown },
  "kraft-white": { type: "kraft", color: STOCK_COLOR.kraftWhite },
  "pet-clear": { type: "pet" },
};

/** A 2D canvas, or null where there is no 2D context (no DOM, jsdom): textures are then skipped, never thrown. */
function canvasContext(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const context = canvas.getContext("2d");
  return context ? [canvas, context] : null;
}

/** Deterministic pseudo-random numbers in [0, 1), so the fibres look the same on every load. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

/** Short light and dark strokes on a pale ground: multiplied into kraft colour and used as a bump map. */
function createFibreTexture(): CanvasTexture | null {
  const surface = canvasContext(FIBRE_SIZE);
  if (!surface) return null;
  const [canvas, ctx] = surface;
  const random = seededRandom(FIBRE_SEED);

  ctx.fillStyle = "hsl(0 0% 92%)";
  ctx.fillRect(0, 0, FIBRE_SIZE, FIBRE_SIZE);
  ctx.lineWidth = 1;
  for (let i = 0; i < FIBRE_COUNT; i++) {
    const [x, y] = [random() * FIBRE_SIZE, random() * FIBRE_SIZE];
    const [angle, length] = [random() * Math.PI, 6 + random() * 18];
    const lightness = random() < 0.5 ? 70 : 100;
    ctx.strokeStyle = `hsl(0 0% ${lightness}% / ${0.08 + random() * 0.12})`;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length);
    ctx.stroke();
  }

  const texture = new CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.repeat.set(FIBRE_REPEAT, FIBRE_REPEAT);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** The soft dark blot under the product (black fading out radially), or null without a 2D context. */
export function createContactShadowTexture(): CanvasTexture | null {
  const surface = canvasContext(SHADOW_SIZE);
  if (!surface) return null;
  const [canvas, ctx] = surface;
  const centre = SHADOW_SIZE / 2;
  const gradient = ctx.createRadialGradient(centre, centre, 0, centre, centre, centre);
  gradient.addColorStop(0, "rgba(0, 0, 0, 0.45)");
  gradient.addColorStop(0.6, "rgba(0, 0, 0, 0.18)");
  gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, SHADOW_SIZE, SHADOW_SIZE);
  return new CanvasTexture(canvas);
}

function bundle(
  base: Material,
  makePrint: (texture: CanvasTexture) => Material,
  stockTexture: Texture | null = null,
): ProductMaterials {
  const printed: Material[] = [];
  const sides = new Map<Side, Material>();
  return {
    base,
    print(texture) {
      const material = makePrint(texture);
      printed.push(material);
      return material;
    },
    onlySide(side) {
      if (base.side === side) return base;
      let material = sides.get(side);
      if (!material) {
        material = base.clone();
        material.side = side;
        sides.set(side, material);
      }
      return material;
    },
    dispose() {
      base.dispose();
      for (const material of [...printed.splice(0), ...sides.values()]) material.dispose();
      sides.clear();
      stockTexture?.dispose();
    },
  };
}

/**
 * The materials for one stock. Paper is a rough standard material, kraft adds a procedural fibre
 * texture (the artwork is already kraft-tinted by `compose`), and PET is clear, transmissive
 * plastic whose print is an opaque-ink decal over transparent, so the cup shows through.
 */
export function createMaterials(
  kind: MaterialKind,
  { side = FrontSide }: MaterialOptions = {},
): ProductMaterials {
  const stock = STOCKS[kind];
  switch (stock.type) {
    case "paper":
      return bundle(
        new MeshStandardMaterial({ color: stock.color, roughness: PAPER_ROUGHNESS, side }),
        (map) => new MeshStandardMaterial({ map, roughness: PAPER_ROUGHNESS }),
      );
    case "kraft": {
      const fibre = createFibreTexture();
      return bundle(
        new MeshStandardMaterial({
          color: stock.color,
          map: fibre,
          roughness: KRAFT_ROUGHNESS,
          side,
        }),
        (map) =>
          new MeshStandardMaterial({
            map,
            bumpMap: fibre,
            bumpScale: KRAFT_BUMP_SCALE,
            roughness: KRAFT_ROUGHNESS,
          }),
        fibre,
      );
    }
    case "pet":
      return bundle(
        new MeshPhysicalMaterial({ ...PET, side }),
        (map) => new MeshPhysicalMaterial({ map, roughness: PET.roughness, transparent: true }),
      );
  }
}
