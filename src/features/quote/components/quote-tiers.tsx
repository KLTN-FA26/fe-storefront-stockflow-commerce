import { formatNumber } from "@/lib/format/number";

/** The tier list lives in `components/storefront` now: the chat's acceptance dialog shows the same one. */
export { PriceTierList as QuoteTierList } from "@/components/storefront/price-tier-list";

/** "8%" — the BE's VAT rate is a percentage (Vat.rate). */
export const ratePercent = (rate: number | null | undefined) =>
  rate == null ? null : `${formatNumber(rate)}%`;
