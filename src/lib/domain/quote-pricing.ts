// A quote's money as the BE computes it (kltn-docs 14 BR-07, BR-08, BR-21; BE QuoteLine, Vat), for a
// PREVIEW only: what is stored and owed is what the BE answers (plan §1.6). Shared by the quote page's
// acceptance form and the chat QUOTE card's acceptance dialog, so both show the same MOQ, tier and total.

/** A price break: from `minQuantity` cartons up, `unitPrice` VND per piece. */
export interface PricingTier {
  minQuantity: number;
  unitPrice: number;
}

/** What pricing needs of a quote line (BE QuoteResponse.Line). */
export interface PricingLine {
  id: string;
  sku: string;
  cartons?: number | null | undefined;
  unitsPerCarton?: number | null | undefined;
  moq?: number | null | undefined;
  tiers: readonly PricingTier[];
  taxRate?: number | null | undefined;
}

/** What pricing needs of a fee line (BE QuoteResponse.Fee). */
export interface PricingFee {
  amount?: number | null | undefined;
  tax?: number | null | undefined;
  taxRate?: number | null | undefined;
}

/** Pieces in `cartons` cartons of the line (14 BR-08: units = cartons × unitsPerCarton). */
export const unitsOf = (cartons: number, unitsPerCarton: number | null | undefined) =>
  cartons * (unitsPerCarton ?? 1);

const ascending = (tiers: readonly PricingTier[]) =>
  [...tiers].sort((a, b) => a.minQuantity - b.minQuantity);

/** The line's MOQ in cartons: where its lowest tier starts (BE QuoteLine.moq). */
export function moqOf(line: Pick<PricingLine, "moq" | "tiers">): number | null {
  if (line.moq != null) return line.moq;
  return ascending(line.tiers)[0]?.minQuantity ?? null;
}

/**
 * The tier for `skuCartons` — the cartons of the line's SKU over every line, which is what picks it
 * (14 §4.1 step 4, BE Quote.accept): the break with the highest start not above it. Null below the
 * MOQ or when the line has no price.
 */
export function tierFor<T extends PricingTier>(tiers: readonly T[], skuCartons: number): T | null {
  let found: T | null = null;
  for (const tier of [...tiers].sort((a, b) => a.minQuantity - b.minQuantity))
    if (tier.minQuantity <= skuCartons) found = tier;
  return found;
}

/**
 * VAT of one line (BE Vat.of): net × rate % rounded half up to the dong, line by line. The rate is
 * a percentage with at most two decimals, so the product is taken in integers.
 */
export function vatOf(net: number, ratePercent: number | null | undefined): number | null {
  if (ratePercent == null) return null;
  return Math.round((net * Math.round(ratePercent * 100)) / 10_000);
}

/** Cartons per SKU over every line: the quantity that picks the tier and meets the MOQ. */
export function cartonsBySku(
  lines: readonly Pick<PricingLine, "id" | "sku">[],
  cartons: Readonly<Record<string, number>>,
): Map<string, number> {
  const total = new Map<string, number>();
  for (const line of lines) {
    const value = cartons[line.id];
    total.set(line.sku, (total.get(line.sku) ?? 0) + (Number.isFinite(value) ? value! : 0));
  }
  return total;
}

export interface LinePreview {
  lineId: string;
  cartons: number;
  units: number;
  moq: number | null;
  belowMoq: boolean;
  tier: PricingTier | null;
  /** VND per piece at the tier; null below the MOQ or unpriced. */
  unitPrice: number | null;
  lineTotal: number | null;
  tax: number | null;
}

export interface QuotePreview {
  lines: LinePreview[];
  subtotal: number | null;
  fees: number;
  tax: number | null;
  /** Goods + fees + VAT; null while any part is unknown (a line below its MOQ). */
  total: number | null;
}

const sum = (values: readonly (number | null)[]) =>
  values.some((value) => value == null)
    ? null
    : values.reduce<number>((acc, value) => acc + (value ?? 0), 0);

/** Fees count once whatever the cartons: their amount and VAT as the BE wrote them. */
export function feeTotals(fees: readonly PricingFee[]) {
  return {
    fees: fees.reduce((acc, fee) => acc + (fee.amount ?? 0), 0),
    tax: fees.reduce((acc, fee) => acc + (fee.tax ?? vatOf(fee.amount ?? 0, fee.taxRate) ?? 0), 0),
  };
}

/**
 * The quote as it would be accepted at `cartons` (line id → cartons; a line not named keeps its
 * proposed cartons): each line at the tier of its SKU's total, its line total
 * (cartons × unitsPerCarton × unit price) and VAT; the total = Σ lines + fees + VAT.
 */
export function previewAcceptance(
  quote: { lines: readonly PricingLine[]; fees: readonly PricingFee[] },
  cartons: Readonly<Record<string, number>>,
): QuotePreview {
  const chosen: Record<string, number> = {};
  for (const line of quote.lines) chosen[line.id] = cartons[line.id] ?? line.cartons ?? 0;
  const bySku = cartonsBySku(quote.lines, chosen);

  const lines = quote.lines.map((line): LinePreview => {
    const count = Number.isFinite(chosen[line.id]) ? chosen[line.id]! : 0;
    const moq = moqOf(line);
    const skuCartons = bySku.get(line.sku) ?? count;
    const tier = tierFor(line.tiers, skuCartons);
    const belowMoq = moq != null && skuCartons < moq;
    const unitPrice = belowMoq ? null : (tier?.unitPrice ?? null);
    const lineTotal = unitPrice == null ? null : unitsOf(count, line.unitsPerCarton) * unitPrice;
    return {
      lineId: line.id,
      cartons: count,
      units: unitsOf(count, line.unitsPerCarton),
      moq,
      belowMoq,
      tier: belowMoq ? null : tier,
      unitPrice,
      lineTotal,
      tax: lineTotal == null ? null : vatOf(lineTotal, line.taxRate),
    };
  });

  const goods = sum(lines.map((line) => line.lineTotal));
  const goodsTax = sum(lines.map((line) => line.tax));
  const feePart = feeTotals(quote.fees);
  return {
    lines,
    subtotal: goods,
    fees: feePart.fees,
    tax: goodsTax == null ? null : goodsTax + feePart.tax,
    total: goods == null || goodsTax == null ? null : goods + feePart.fees + goodsTax + feePart.tax,
  };
}
