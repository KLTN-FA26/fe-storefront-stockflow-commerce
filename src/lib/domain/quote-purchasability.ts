// Whether a quote line's SKU may still be bought (kltn-docs 01 BR-04; BE Purchasability on
// QuoteResponse.Line). Shared by the quote page and the chat QUOTE card, so both block the same
// acceptance and say the same sentence.

/** The BE verdicts that refuse a line: its product or variant can no longer be bought. */
export const UNSELLABLE_VERDICTS = [
  "PRODUCT_INACTIVE",
  "PRODUCT_DISCONTINUED",
  "PRODUCT_NOT_APPROVED",
  "VARIANT_NOT_ACTIVE",
] as const;

export const PURCHASABILITY_VALUES = ["PURCHASABLE", ...UNSELLABLE_VERDICTS] as const;

/**
 * A line whose SKU can no longer be bought: one of the known refusals only. A verdict this FE does
 * not know yet (`tolerantEnum` reads it as UNKNOWN) counts as PURCHASABLE (owner decision 13): the
 * BE still refuses the acceptance with SKU_NOT_SELLABLE if the line cannot be sold. Null or missing
 * (a legacy line, or a BE before the field) is not a refusal either.
 */
export const isUnsellable = (purchasability: string | null | undefined): boolean =>
  purchasability != null && (UNSELLABLE_VERDICTS as readonly string[]).includes(purchasability);

/** Whether any line of a quote blocks its acceptance (the BE refuses with SKU_NOT_SELLABLE). */
export const hasUnsellableLine = (
  lines: readonly { purchasability?: string | null | undefined }[],
): boolean => lines.some((line) => isUnsellable(line.purchasability));

/** What the customer reads when a line blocks acceptance; asking Sale to revise stays open. */
export const UNSELLABLE_QUOTE_NOTICE =
  "Báo giá có sản phẩm đã ngừng bán. Bạn có thể yêu cầu Sale sửa báo giá.";

/** The tag next to such a line. */
export const UNSELLABLE_LINE_TAG = "Đã ngừng bán";
