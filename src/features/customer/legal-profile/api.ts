import { z } from "zod";

import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/error";

/**
 * GET /customers/me/legal-profile (R5-10): the legal identity the customer's contracts and e-invoices
 * use, read only. Every field may be null; `data: null` when the customer has none yet.
 */
export const legalProfileSchema = z.object({
  legalName: z.string().nullish(),
  taxCode: z.string().nullish(),
  registeredAddress: z.string().nullish(),
  representativeName: z.string().nullish(),
  representativeTitle: z.string().nullish(),
  invoiceEmail: z.string().nullish(),
  bankAccountNumber: z.string().nullish(),
  bankName: z.string().nullish(),
  bankAccountHolder: z.string().nullish(),
});

export type LegalProfile = z.infer<typeof legalProfileSchema>;

/**
 * The profile, or null when there is none to show: `data: null`, a 404, and - before the BE has the
 * endpoint - the 400 its staff route answers for "me" or a 403. The card is then simply left out.
 */
export async function getMyLegalProfile(signal?: AbortSignal): Promise<LegalProfile | null> {
  try {
    const { data } = await api.get<unknown>(
      "/customers/me/legal-profile",
      signal ? { signal } : {},
    );
    return data == null ? null : legalProfileSchema.parse(data);
  } catch (error) {
    if (error instanceof ApiError && [400, 403, 404].includes(error.status)) return null;
    throw error;
  }
}
