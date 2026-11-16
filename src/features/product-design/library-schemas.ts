import { z } from "zod";

import { beId } from "@/lib/validation/primitives";

import { textElementSchema } from "./engine/document/schema";
import { designAssetDtoSchema } from "./schemas";

// The project library of spec 2026-11-12 §3–§4 (`LibraryItem`): images and saved text styles the
// designs of a project share. Same rules as `schemas.ts`: nullable wire fields are sent as `null`.

/** ASSUMPTION (open-question B43): at most 30 images; ASSUMPTION (A-E1): 30 text styles too, counted apart. */
export const LIBRARY_LIMIT = 30;
/** ASSUMPTION (A-E1): a saved text is a line or two, not a page. */
export const LIBRARY_TEXT_MAX = 500;
/** The shortened text a text style is listed under. */
export const LIBRARY_NAME_MAX = 40;

const instant = z.string().min(1);

/**
 * A text style: exactly the look fields of a text element, so placing one makes an ordinary text
 * element. A later plan adds `uppercase`; it is not here yet, so a field this schema does not
 * know is dropped, not kept.
 */
export const textStyleSchema = textElementSchema.pick({
  fontCode: true,
  sizePt: true,
  color: true,
  bold: true,
  italic: true,
  align: true,
  outline: true,
  letterSpacingEm: true,
  lineHeight: true,
});

/** A library image: a `DesignAsset`'s facts, less the design it belongs to, and a preview link. */
export const libraryImageSchema = z.object({
  id: beId(),
  kind: z.literal("IMAGE"),
  name: z.string().min(1),
  asset: designAssetDtoSchema.omit({ assetId: true, designId: true }),
  previewUrl: z.string().min(1).nullable(),
  createdAt: instant,
});

/** A saved text style: the text (shortened in `name`) and the style it was set in. */
export const libraryTextSchema = z.object({
  id: beId(),
  kind: z.literal("TEXT"),
  name: z.string().min(1),
  text: z.string().min(1).max(LIBRARY_TEXT_MAX),
  style: textStyleSchema,
  createdAt: instant,
});

/** GET /design-projects/{id}/library rows. */
export const libraryItemSchema = z.discriminatedUnion("kind", [
  libraryImageSchema,
  libraryTextSchema,
]);

/** POST …/texts: a text and its style (the server holds both to the same limits). */
export const libraryTextInputSchema = z.object({
  text: z
    .string()
    .trim()
    .min(1, "Hãy nhập nội dung chữ")
    .max(LIBRARY_TEXT_MAX, "Chữ tối đa 500 ký tự"),
  style: textStyleSchema,
});

/** POST …/assets/from-design: an image of a design, copied into the library. */
export const saveImageToLibraryInputSchema = z.object({ designId: beId(), assetId: beId() });
