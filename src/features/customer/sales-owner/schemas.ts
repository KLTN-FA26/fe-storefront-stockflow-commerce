import { z } from "zod";

import { tolerantEnum } from "@/lib/validation/tolerant-enum";

/**
 * The customer's view of who looks after them (HOP-DONG-API, BE-A; KE-HOACH sales owner §10.5). Every field is
 * optional: the BE ships in parallel, and a field it does not send yet must not break the account page.
 */

/** `GET /customers/me/sales-owner`: `{name, active, coverName|null}`, no staff e-mail or phone. */
export const salesOwnerSchema = z.object({
  name: z.string().nullish(),
  active: z.boolean().nullish(),
  coverName: z.string().nullish(),
});
export type SalesOwner = z.infer<typeof salesOwnerSchema>;

/** `GET /customers/me/sales-options`: the active Sales, by name only, for the "preferred" choice. */
export const salesOptionSchema = z.object({ userId: z.string(), name: z.string() });
export const salesOptionsSchema = z.array(salesOptionSchema);
export type SalesOption = z.infer<typeof salesOptionSchema>;

export const OWNER_CHANGE_REQUEST_STATUSES = [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "WITHDRAWN",
] as const;
export const OWNER_CHANGE_REQUEST_REASONS = [
  "SLOW_RESPONSE",
  "NOT_SATISFIED",
  "PREFER_KNOWN_CONTACT",
  "OTHER",
] as const;
export type OwnerChangeRequestReason = (typeof OWNER_CHANGE_REQUEST_REASONS)[number];

/**
 * A row of `GET /customers/me/sales-owner-change-requests` (latest first). ASSUMPTION (the contract names the
 * endpoint, not the row): `status`, `reason`, the customer's `note`, `preferredSalesName`, the Sales Manager's
 * `decisionNote` (the reason given with a rejection), `createdAt`, `decidedAt`. Only `status` is needed to show it.
 */
export const ownerChangeRequestSchema = z.object({
  id: z.string().nullish(),
  status: tolerantEnum(OWNER_CHANGE_REQUEST_STATUSES),
  reason: tolerantEnum(OWNER_CHANGE_REQUEST_REASONS).nullish(),
  note: z.string().nullish(),
  preferredSalesName: z.string().nullish(),
  decisionNote: z.string().nullish(),
  createdAt: z.string().nullish(),
  decidedAt: z.string().nullish(),
});
export type OwnerChangeRequest = z.infer<typeof ownerChangeRequestSchema>;
export type OwnerChangeRequestStatus = OwnerChangeRequest["status"];

/** A plain list or a page of them: the contract says "latest first", not which. */
export const ownerChangeRequestListSchema = z.union([
  z.array(ownerChangeRequestSchema),
  z.object({ items: z.array(ownerChangeRequestSchema) }).transform((page) => page.items),
]);

/** The form: a reason from the contract's list, a note (required for "Lý do khác"), an optional preferred Sales. */
export const ownerChangeRequestFormSchema = z
  .object({
    reason: z.enum(OWNER_CHANGE_REQUEST_REASONS, { message: "Vui lòng chọn lý do" }),
    note: z.string().trim().max(1000, "Tối đa 1000 ký tự"),
    preferredSalesUserId: z.string(),
  })
  .refine((values) => values.reason !== "OTHER" || values.note !== "", {
    path: ["note"],
    message: "Vui lòng ghi rõ lý do",
  });

export type OwnerChangeRequestFormInput = z.input<typeof ownerChangeRequestFormSchema>;
export type OwnerChangeRequestFormValues = z.output<typeof ownerChangeRequestFormSchema>;

/** `POST /customers/me/sales-owner-change-requests` body: `{reason, note, preferredSalesUserId?}`. */
export function toOwnerChangeRequest(values: OwnerChangeRequestFormValues) {
  return {
    reason: values.reason,
    note: values.note,
    ...(values.preferredSalesUserId ? { preferredSalesUserId: values.preferredSalesUserId } : {}),
  };
}
export type OwnerChangeRequestBody = ReturnType<typeof toOwnerChangeRequest>;
