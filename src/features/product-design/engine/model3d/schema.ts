import { z } from "zod";

import { printAreaCodeSchema } from "../template/schema";

/** Longest mesh name the contract takes (spec 2026-11-13 §3). */
const MESH_NAME_MAX = 100;

/** The mesh the loader looks for: it can only ever find `print:` plus the print area code. */
export const printMeshName = (code: string) => `print:${code}`;

/**
 * The `.glb` that stands beside a print configuration's parametric `template.model` (spec
 * 2026-11-13 §3): where the file is, and which mesh of it carries each print area. The numbers of
 * the template stay the base of everything 2D; this only feeds the 3D viewer.
 *
 * Own rules: each `meshName` is `print:<its printAreaCode>`, no print area twice. The print config
 * DTO adds the rules that need the template (every print area mapped, none foreign) and, when any
 * rule fails, drops the link to `null` with a warning instead of failing the config (spec §8: a
 * problem with the `.glb` never blocks designing).
 */
export const model3dRefSchema = z
  .object({
    url: z.string().min(1),
    surfaces: z
      .array(
        z.object({
          printAreaCode: printAreaCodeSchema,
          meshName: z.string().min(1).max(MESH_NAME_MAX),
        }),
      )
      .min(1),
  })
  .superRefine((ref, ctx) => {
    const seen = new Set<string>();
    ref.surfaces.forEach((surface, i) => {
      if (seen.has(surface.printAreaCode)) {
        ctx.addIssue({
          code: "custom",
          path: ["surfaces", i, "printAreaCode"],
          message: `Print area ${surface.printAreaCode} appears twice`,
        });
      }
      seen.add(surface.printAreaCode);
      if (surface.meshName !== printMeshName(surface.printAreaCode)) {
        ctx.addIssue({
          code: "custom",
          path: ["surfaces", i, "meshName"],
          message: `The mesh of print area ${surface.printAreaCode} must be named ${printMeshName(surface.printAreaCode)}`,
        });
      }
    });
  });

export type Model3dRef = z.infer<typeof model3dRefSchema>;
