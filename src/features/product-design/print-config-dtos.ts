import { z } from "zod";

import { beId } from "@/lib/validation/primitives";

import { printAreaSchema, productModelSchema } from "./engine/template/schema";

// What the BE sends of a print configuration (`origin/develop` 85e6036a): there is no
// "print-config" object. A product's templates come from `GET /catalog/products/{slug}/customization`
// (`CatalogCustomizationResponse`), and the template of one design from `GET /designs/{id}/template`
// (the same template JSON, `active` added, no `hasCartonSpec`). `print-config-mappers.ts` builds the
// domain `PrintConfig` from them.

/**
 * One template, as both reads send it. `maxColors` and `allowedFontCodes` are left out when null;
 * `model3d` is left out when the template has no `.glb` (it is read as `unknown` here: an invalid
 * one must never fail the template, see `print-config-schemas.ts`). `model` and `printAreas` are
 * the engine's own schemas: the BE sends exactly their fields.
 */
export const templateDtoSchema = z.object({
  templateId: z.string().min(1),
  code: z.string().min(1),
  name: z.string().min(1),
  sku: z.string().min(1),
  minDpi: z.number().positive(),
  colorMode: z.enum(["RGB", "CMYK"]),
  allowedFileFormats: z.array(z.string().min(1)),
  maxFileSizeMb: z.number().positive(),
  maxColors: z.number().int().positive().nullish(),
  allowedFontCodes: z.array(z.string().min(1)).nullish(),
  model: productModelSchema,
  printAreas: z.array(printAreaSchema).min(1),
  /** Only the customization read has it (A-2); the design's template read does not. */
  hasCartonSpec: z.boolean().optional(),
  /** Only the design's template read has it. */
  active: z.boolean().optional(),
  model3d: z.unknown().optional(),
});
export type TemplateDto = z.infer<typeof templateDtoSchema>;

/**
 * `GET /catalog/products/{slug}/customization`. A template is read in full only once it is chosen by
 * SKU (`templateDtoSchema`): one that cannot be read must not hide the product's other variants, so
 * the list holds just what choosing needs, and keeps the rest as it came.
 */
export const customizationDtoSchema = z.object({
  productId: beId(),
  kind: z.string().nullish(),
  templates: z.array(
    z.looseObject({
      code: z.string().min(1),
      sku: z.string().min(1),
      hasCartonSpec: z.boolean().optional(),
    }),
  ),
});
export type CustomizationDto = z.infer<typeof customizationDtoSchema>;

/** `GET /catalog/products/{slug}`, as far as the print configuration needs it: the title (F-7). */
export const productTitleDtoSchema = z.object({ title: z.string().min(1) });
