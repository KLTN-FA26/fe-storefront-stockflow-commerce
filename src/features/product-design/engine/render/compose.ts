import type {
  DesignElement,
  Hex,
  ImageElement,
  SurfaceContent,
  TextElement,
} from "../document/schema";
import { elementMatrix, isWrapped, type ElementSizer } from "../geometry/element";
import { outlineRadii, polarWarp } from "../geometry/polar-warp";
import type { PrintSurface } from "../surfaces/types";
import type { MaterialKind } from "../template/schema";
import { arcGlyphs } from "./arc-text";
import type { FontRegistry, TextMeasurer } from "./fonts";
import type { ComposeTarget, DrawOp, ImageOp, TextOp } from "./ops";
import { layoutText } from "./text-layout";

/** Kraft-brown the artwork is multiplied by on the 3D model: ink on kraft paper reads darker, never white. */
export const KRAFT_INK_TINT: Hex = "#B4875A";

export type ComposeInput = {
  surface: PrintSurface;
  content: SurfaceContent;
  target: ComposeTarget;
  material: MaterialKind;
  sizer: ElementSizer;
  fonts: FontRegistry;
  measure: TextMeasurer;
};

const isKraft = (material: MaterialKind) => material === "kraft" || material === "kraft-brown";

/** Ink is tinted on the 3D model only; the print file and the editor show the artwork as designed. */
const tintsInk = (target: ComposeTarget) => target === "texture" || target === "preview";

function imageOp(el: ImageElement, { surface, sizer }: ComposeInput): ImageOp {
  return {
    op: "image",
    matrix: elementMatrix(el, surface),
    box: sizer(el),
    assetId: el.assetId,
    opacity: el.opacity,
  };
}

function textOp(el: TextElement, { surface, fonts, measure }: ComposeInput): TextOp {
  return {
    op: "text",
    matrix: elementMatrix(el, surface),
    layout: layoutText(el, fonts, measure),
    color: el.color,
    ...(el.outline ? { outline: el.outline } : {}),
    opacity: el.opacity,
  };
}

/** The rigid text op, or where it wraps the cup its glyphs along the arc (`arcText.source` is the rigid op). */
function wrappedOrRigidText(el: TextElement, input: ComposeInput): DrawOp {
  const source = textOp(el, input);
  if (!isWrapped(el, input.surface)) return source;
  const { surface, fonts, measure } = input;
  return { op: "arcText", source, glyphs: arcGlyphs(el, source.layout, surface, fonts, measure) };
}

/** The rigid image op, or where it wraps the cup its exact polar warp over the same box. */
function wrappedOrRigidImage(el: ImageElement, input: ComposeInput): DrawOp {
  const source = imageOp(el, input);
  const warp = polarWarp(el, input.surface, source.box);
  if (warp === undefined) return source;
  const sheetRadiiMm = outlineRadii(input.surface.outline("bleed"), warp.apex);
  return { op: "warpedImage", id: el.id, source, warp, sheetRadiiMm };
}

function drawElement(el: DesignElement, input: ComposeInput): DrawOp {
  switch (el.type) {
    case "image":
      return wrappedOrRigidImage(el, input);
    case "text":
      return wrappedOrRigidText(el, input);
    case "drawing":
      return {
        op: "drawing",
        id: el.id,
        matrix: elementMatrix(el, input.surface),
        box: input.sizer(el),
        strokes: el.strokes,
        opacity: el.opacity,
      };
  }
}

function backgroundOps({ content, surface }: ComposeInput): DrawOp[] {
  const { background } = content;
  switch (background.kind) {
    case "none":
      return [];
    case "color":
      return [{ op: "fill", path: surface.outline("bleed"), color: background.color }];
    case "pattern":
      return [
        {
          op: "pattern",
          bounds: surface.flatBounds,
          patternId: background.patternId,
          colors: background.colors,
          scale: background.scale,
          rotationDeg: background.rotationDeg,
        },
      ];
  }
}

/**
 * Turns one surface's content into draw ops in flat mm: clip to the bleed, paint the background,
 * then each visible element in array (z) order (`warpedImage`, or `arcText`, where it wraps the
 * cup), tint kraft for the 3D model, and finally the editor's guides outside the clip. Pure:
 * no canvas, no DOM.
 */
export function compose(input: ComposeInput): DrawOp[] {
  const { surface, content, target, material } = input;
  const bleed = surface.outline("bleed");

  const ops: DrawOp[] = [
    { op: "save" },
    { op: "clip", path: bleed },
    ...backgroundOps(input),
    ...content.elements.filter((el) => !el.hidden).map((el) => drawElement(el, input)),
  ];
  if (isKraft(material) && tintsInk(target)) {
    ops.push({ op: "multiply", path: bleed, color: KRAFT_INK_TINT });
  }
  ops.push({ op: "restore" });
  if (target === "editor") {
    ops.push({ op: "guides", guides: surface.guides(), shadeOutside: surface.outline("trim") });
  }
  return ops;
}
