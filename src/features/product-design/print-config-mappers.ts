import { customizationTemplateSchema } from "./engine/template/schema";
import { printConfigSchema } from "./print-config-schemas";
import type { TemplateDto } from "./print-config-dtos";
import type { PrintConfig } from "./types";

// DTO → domain, for the print configuration (see `print-config-dtos.ts`). The BE has no
// print-config object, so the fields it does not give are decided here, once (F-22, F-23, F-7).

/** What the caller knows of the product and the variant, beside the template. */
export type PrintConfigParts = {
  template: TemplateDto;
  product: { slug: string; title: string; status: string };
  variantStatus: PrintConfig["variantStatus"];
  hasCartonSpec: boolean;
};

/**
 * The domain print configuration of one template.
 *  - `sku`, `template`, `model3d` come from the template; `maxColors` / `allowedFontCodes` the BE
 *    leaves out are `null`; an absent `model3d` is `null` and an invalid one degrades to `null`
 *    with a warning (`printConfigSchema`);
 *  - `fileRules` are the template's own `minDpi`, `allowedFileFormats` (as `formats`) and
 *    `maxFileSizeMb`;
 *  - `product`, `variantStatus` and `hasCartonSpec` are given by the caller, from what each read
 *    knows (`api-print-config.ts`).
 */
export function toPrintConfig({
  template: dto,
  product,
  variantStatus,
  hasCartonSpec,
}: PrintConfigParts): PrintConfig {
  const { hasCartonSpec: _carton, active: _active, model3d, ...fields } = dto;
  const template = customizationTemplateSchema.parse({
    ...fields,
    maxColors: fields.maxColors ?? null,
    allowedFontCodes: fields.allowedFontCodes ?? null,
  });
  return printConfigSchema.parse({
    sku: template.sku,
    product,
    variantStatus,
    hasCartonSpec,
    template,
    model3d,
    fileRules: {
      minDpi: template.minDpi,
      formats: template.allowedFileFormats,
      maxFileSizeMb: template.maxFileSizeMb,
    },
  });
}
