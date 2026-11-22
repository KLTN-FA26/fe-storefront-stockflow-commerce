import { z } from "zod";

import { type Model3dRef, model3dRefSchema } from "./engine/model3d/schema";
import { customizationTemplateSchema } from "./engine/template/schema";

const code = z.string().min(1);

/** The link when it is valid by its own shape and against the template, else `null` plus a warning. */
function usableModel3d(config: {
  sku: string;
  template: z.infer<typeof customizationTemplateSchema>;
  model3d?: unknown;
}): Model3dRef | null {
  if (config.model3d === undefined || config.model3d === null) return null;
  const parsed = model3dRefSchema.safeParse(config.model3d);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    warnIgnored(config, issue?.path ?? [], issue?.message ?? "invalid");
    return null;
  }
  const problem = templateProblem(parsed.data, config.template);
  if (problem === null) return parsed.data;
  warnIgnored(config, problem.path, problem.message);
  return null;
}

type Problem = { path: PropertyKey[]; message: string };

/** Every print area of the template has one entry, and every entry is a print area of it. */
function templateProblem(
  ref: Model3dRef,
  template: z.infer<typeof customizationTemplateSchema>,
): Problem | null {
  const codes = new Set<string>(template.printAreas.map((area) => area.code));
  const foreign = ref.surfaces.findIndex((surface) => !codes.has(surface.printAreaCode));
  if (foreign >= 0) {
    return {
      path: ["surfaces", foreign, "printAreaCode"],
      message: `The template has no print area ${ref.surfaces[foreign]?.printAreaCode}`,
    };
  }
  const mapped = new Set<string>(ref.surfaces.map((surface) => surface.printAreaCode));
  const missing = [...codes].find((code) => !mapped.has(code));
  return missing === undefined
    ? null
    : { path: ["surfaces"], message: `Print area ${missing} has no mesh` };
}

function warnIgnored(
  config: { sku: string; template: { code: string } },
  path: PropertyKey[],
  message: string,
): void {
  console.warn(
    `Print configuration ${config.template.code} (${config.sku}): model3d ignored, the code-built model is used. ${["model3d", ...path.map(String)].join(".")}: ${message}`,
  );
}

/**
 * The print configuration as the studio and the launcher read it: a variant's template, its `.glb`
 * and its file rules. The BE has no such object: `print-config-mappers.ts` builds it from the
 * customization read and the design's template read (F-22, F-23). File formats are lowercase MIME
 * types, as the engine's template wants them (docs open-questions B34: 300 DPI, PNG/JPG, 50 MB).
 */
export const printConfigSchema = z
  .object({
    sku: code,
    product: z.object({ slug: code.nullable(), title: z.string().min(1), status: code }),
    variantStatus: z.enum(["ACTIVE", "BLOCKED", "OBSOLETE"]),
    /** docs 12 BR-05, B25: needed before submitting. */
    hasCartonSpec: z.boolean(),
    template: customizationTemplateSchema,
    /**
     * The `.glb` beside the template's numbers (spec 2026-11-13 §3). Read as `unknown` and checked
     * in the transform below, where the template is known.
     */
    model3d: z.unknown().optional(),
    fileRules: z.object({
      minDpi: z.number().positive(),
      formats: z.array(z.string().min(1)).min(1),
      maxFileSizeMb: z.number().positive(),
    }),
  })
  // A bad `.glb` link never blocks the config (spec 2026-11-13 §8): it becomes `null` and one
  // warning says why. Everything else in the object stays strict.
  .transform((config) => ({ ...config, model3d: usableModel3d(config) }));
