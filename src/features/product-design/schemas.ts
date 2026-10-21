import { z } from "zod";

export const designStatusSchema = z.enum([
  "Draft",
  "Ready",
  "Confirmed",
  "Locked",
  "Superseded",
  "Cancelled",
]);
export const preflightResultSchema = z.enum(["Pass", "Warning", "Fail"]);

export const designElementSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["text", "image", "shape"]),
  label: z.string().min(1),
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  width: z.number().positive().max(100),
  height: z.number().positive().max(100),
  outsidePrintArea: z.boolean().default(false),
});

export const preflightIssueSchema = z.object({
  id: z.string().min(1),
  level: z.enum(["pass", "warning", "fail"]),
  message: z.string().min(1),
});

export const designDtoSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  productName: z.string().min(1),
  variantName: z.string().min(1),
  status: designStatusSchema,
  preflightResult: preflightResultSchema,
  version: z.number().int().positive(),
  updatedAt: z.string().min(1),
  elements: z.array(designElementSchema),
  preflightIssues: z.array(preflightIssueSchema),
});

export const designUpdateInputSchema = designDtoSchema
  .pick({
    id: true,
    variantName: true,
    elements: true,
  })
  .extend({
    preflightResult: preflightResultSchema,
    preflightIssues: z.array(preflightIssueSchema),
  })
  // BR-01 docs 12 §6: Không cho Confirmed khi preflight còn lỗi Fail.
  .refine((design) => design.preflightResult !== "Fail", {
    message: "Không thể xác nhận khi preflight không đạt",
    path: ["preflightResult"],
  })
  // BR-02 docs 12 §6: Nội dung thiết kế không được vượt ngoài print area.
  .refine((design) => !design.elements.some((element) => element.outsidePrintArea), {
    message: "Có phần tử nằm ngoài vùng in",
    path: ["elements"],
  });

export const confirmDesignInputSchema = z
  .object({
    id: z.string().min(1),
    acceptedWarnings: z.boolean().default(false),
    preflightResult: preflightResultSchema,
  })
  // BR-01 docs 12 §6: Không confirm khi preflight còn lỗi Fail.
  .refine((input) => input.preflightResult !== "Fail", {
    message: "Không thể xác nhận khi preflight không đạt",
    path: ["preflightResult"],
  });
