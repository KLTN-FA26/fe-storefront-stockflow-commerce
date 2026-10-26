import { z } from "zod";

import { printAreaCodeSchema } from "../template/schema";

/**
 * Design document (spec §4.2): what the customer composed on each print area.
 * Placements, sizes and stroke points are millimetres; font size is points; colours are sRGB hex.
 */

/** Serialized-document budget: the backend answers 413 above it (spec §4.2, P3). */
export const MAX_DOCUMENT_BYTES = 1_000_000;
export const MAX_ELEMENTS_PER_SURFACE = 200;

export const PATTERN_IDS = ["dots", "stripes", "checker", "waves", "grid", "chevron"] as const;

export type Hex = `#${string}`;
export type PatternId = (typeof PATTERN_IDS)[number];

/** `#RRGGBB` in either case; stored upper-case so equal colours compare equal. */
export const hexSchema = z
  .string()
  .regex(/^#[0-9a-f]{6}$/i, "Expected a #RRGGBB colour")
  .transform((value): Hex => `#${value.slice(1).toUpperCase()}`);

const positive = z.number().positive();

/** Where an element sits on its surface, in the surface's own (u, v) mm frame (spec §4.3). */
export const placementSchema = z.object({
  u: z.number(),
  v: z.number(),
  rotationDeg: z.number(),
  scale: positive,
});

const elementBaseShape = {
  id: z.string().min(1),
  name: z.string(),
  hidden: z.boolean(),
  locked: z.boolean(),
  opacity: z.number().min(0).max(1),
  placement: placementSchema,
  /** Cup only: follow the circumference instead of staying a flat quad. */
  wrap: z.boolean().optional(),
};

export const imageElementSchema = z.object({
  ...elementBaseShape,
  type: z.literal("image"),
  assetId: z.string().min(1),
  /** Stored so DPI can be computed without loading the asset. */
  naturalWidthPx: z.number().int().positive(),
  naturalHeightPx: z.number().int().positive(),
  widthMm: positive,
  heightMm: positive,
  flipX: z.boolean(),
  flipY: z.boolean(),
});

export const textElementSchema = z.object({
  ...elementBaseShape,
  type: z.literal("text"),
  content: z.string(),
  fontCode: z.string().min(1),
  sizePt: positive,
  color: hexSchema,
  align: z.enum(["left", "center", "right"]),
  bold: z.boolean(),
  italic: z.boolean(),
  letterSpacingEm: z.number(),
  lineHeight: positive,
  outline: z.object({ color: hexSchema, widthMm: positive }).optional(),
});

/** Points are `[x, y, pressure]` in mm in the drawing's local frame. */
export const strokeSchema = z.object({
  mode: z.enum(["draw", "erase"]),
  color: hexSchema,
  sizeMm: positive,
  points: z.array(z.tuple([z.number(), z.number(), z.number().min(0).max(1)])),
});

/** An erase stroke only affects its own drawing element, never the logo or background below. */
export const drawingElementSchema = z.object({
  ...elementBaseShape,
  type: z.literal("drawing"),
  strokes: z.array(strokeSchema),
});

export const elementSchema = z.discriminatedUnion("type", [
  imageElementSchema,
  textElementSchema,
  drawingElementSchema,
]);

export const backgroundSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("none") }),
  z.object({ kind: z.literal("color"), color: hexSchema }),
  z.object({
    kind: z.literal("pattern"),
    patternId: z.enum(PATTERN_IDS),
    colors: z.tuple([hexSchema, hexSchema]),
    scale: positive,
    rotationDeg: z.number(),
  }),
]);

export const surfaceContentSchema = z.object({
  background: backgroundSchema,
  /** Array order is z-order: the last element is on top. */
  elements: z.array(elementSchema).max(MAX_ELEMENTS_PER_SURFACE),
});

export const designDocumentSchema = z.object({
  schemaVersion: z.literal(1),
  templateCode: z.string().min(1),
  sku: z.string().min(1),
  surfaces: z.partialRecord(printAreaCodeSchema, surfaceContentSchema),
});

export type Placement = z.infer<typeof placementSchema>;
export type ImageElement = z.infer<typeof imageElementSchema>;
export type TextElement = z.infer<typeof textElementSchema>;
export type Stroke = z.infer<typeof strokeSchema>;
export type DrawingElement = z.infer<typeof drawingElementSchema>;
export type DesignElement = z.infer<typeof elementSchema>;
export type Background = z.infer<typeof backgroundSchema>;
export type SurfaceContent = z.infer<typeof surfaceContentSchema>;
export type DesignDocument = z.infer<typeof designDocumentSchema>;
