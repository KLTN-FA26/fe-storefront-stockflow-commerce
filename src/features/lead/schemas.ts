import { z } from "zod";

import { requiredString, vietnamPhone } from "@/lib/validation/primitives";

/**
 * The lead form of channel B (KE-HOACH sales owner §10.3; HOP-DONG-API `POST /api/v1/public/leads`): a business that
 * is not a customer yet leaves its details, a Sales Manager gives the lead to a Sales, who calls back, checks the
 * business and opens its account. There is no self sign-up: printed packaging is B2B, the business is verified first.
 */

/**
 * What the business wants printed. ASSUMPTION (HOP-DONG-API names `interests[]` but not its values): the four product
 * families of KE-HOACH §10.7 "ly / hộp / túi / tô", as English constants like every BE enum.
 */
export const LEAD_INTERESTS = ["CUP", "BOX", "BAG", "BOWL"] as const;
export type LeadInterest = (typeof LEAD_INTERESTS)[number];

export const LEAD_INTEREST_LABELS: Record<LeadInterest, string> = {
  CUP: "Ly",
  BOX: "Hộp",
  BAG: "Túi",
  BOWL: "Tô",
};

/**
 * An organisation's tax code in the BE's canonical form (BE `TaxCode.normalise`): 10 digits, or 10-3 for a dependent
 * unit (Thông tư 86/2024/TT-BTC art. 5). Spaces and dots are dropped and 13 digits typed without the dash become
 * 10-3, so "0312 345 678-001", "0312345678001" and "0312345678-001" are one code. Null for anything else. The lead
 * form asks for a business's code only (KE-HOACH §10.7: "MST 10 / 13 số").
 */
export function normalizeTaxCode(raw: string): string | null {
  const compact = raw.trim().replace(/[\s.]/g, "");
  if (/^\d{10}(?:-\d{3})?$/.test(compact)) return compact;
  if (/^\d{13}$/.test(compact)) return `${compact.slice(0, 10)}-${compact.slice(10)}`;
  return null;
}

export const TAX_CODE_MESSAGE = "Mã số thuế gồm 10 số, hoặc 13 số (dạng 0123456789-001)";

const taxCode = requiredString("Vui lòng nhập mã số thuế").transform((value, ctx) => {
  const normalized = normalizeTaxCode(value);
  if (normalized) return normalized;
  ctx.addIssue({ code: "custom", message: TAX_CODE_MESSAGE });
  return z.NEVER;
});

const optionalText = (max: number) => z.string().trim().max(max, `Tối đa ${max} ký tự`);

/**
 * The form. Lengths are the BE's limits as the contract implies them ("giới hạn độ dài từng ô", §10.7); the BE
 * re-checks everything. `website` is the honeypot: a person never sees it, a bot that fills every input does.
 */
export const leadFormSchema = z.object({
  companyName: requiredString("Vui lòng nhập tên công ty").max(200, "Tối đa 200 ký tự"),
  taxCode,
  contactName: requiredString("Vui lòng nhập tên người liên hệ").max(100, "Tối đa 100 ký tự"),
  contactTitle: optionalText(100),
  phone: requiredString("Vui lòng nhập số điện thoại").pipe(vietnamPhone),
  email: requiredString("Vui lòng nhập email")
    .max(254, "Tối đa 254 ký tự")
    .pipe(z.email("Email không hợp lệ")),
  province: requiredString("Vui lòng chọn tỉnh/thành phố").max(100, "Tối đa 100 ký tự"),
  interests: z.array(z.enum(LEAD_INTERESTS)),
  monthlyVolume: optionalText(100),
  note: optionalText(1000),
  // Personal data is processed only with the person's consent (Nghị định 13/2023/NĐ-CP art. 11).
  consent: z.boolean().refine((value) => value, {
    message: "Vui lòng đồng ý để chúng tôi xử lý thông tin liên hệ của bạn",
  }),
  website: z.string(),
});

export type LeadFormInput = z.input<typeof leadFormSchema>;
export type LeadFormValues = z.output<typeof leadFormSchema>;

export const EMPTY_LEAD_FORM: LeadFormInput = {
  companyName: "",
  taxCode: "",
  contactName: "",
  contactTitle: "",
  phone: "",
  email: "",
  province: "",
  interests: [],
  monthlyVolume: "",
  note: "",
  consent: false,
  website: "",
};

/** The body of `POST /public/leads`; an optional text left empty is not sent. */
export type LeadRequest = {
  companyName: string;
  taxCode: string;
  contactName: string;
  contactTitle?: string;
  phone: string;
  email: string;
  province: string;
  interests: LeadInterest[];
  monthlyVolume?: string;
  note?: string;
  consent: true;
};

export function toLeadRequest(values: LeadFormValues): LeadRequest {
  const optional = (key: "contactTitle" | "monthlyVolume" | "note") =>
    values[key] ? { [key]: values[key] } : {};
  return {
    companyName: values.companyName,
    taxCode: values.taxCode,
    contactName: values.contactName,
    ...optional("contactTitle"),
    phone: values.phone,
    email: values.email,
    province: values.province,
    interests: values.interests,
    ...optional("monthlyVolume"),
    ...optional("note"),
    consent: true,
  };
}

/** The BE always answers 202 `{received: true}`, whether or not the business is already a customer (§10.7). */
export const leadReceiptSchema = z.object({ received: z.boolean().optional() }).nullish();
