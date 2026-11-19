import type { Quote, QuoteFee, QuoteLine, QuoteTier } from "./types";

// The quote's money as the BE computes it (kltn-docs 14 BR-07, BR-08, BR-21; BE QuoteLine, Vat),
// for a PREVIEW only: what is stored and owed is what the BE answers (plan §1.6).

/** Pieces in `cartons` cartons of the line (14 BR-08: units = cartons × unitsPerCarton). */
export const unitsOf = (cartons: number, unitsPerCarton: number | null | undefined) =>
  cartons * (unitsPerCarton ?? 1);

const ascending = (tiers: readonly QuoteTier[]) =>
  [...tiers].sort((a, b) => a.minQuantity - b.minQuantity);

/** The line's MOQ in cartons: where its lowest tier starts (BE QuoteLine.moq). */
export function moqOf(line: Pick<QuoteLine, "moq" | "tiers">): number | null {
  if (line.moq != null) return line.moq;
  return ascending(line.tiers)[0]?.minQuantity ?? null;
}

/**
 * The tier for `skuCartons` — the cartons of the line's SKU over every line, which is what picks it
 * (14 §4.1 step 4, BE Quote.accept): the break with the highest start not above it. Null below the
 * MOQ or when the line has no price.
 */
export function tierFor(tiers: readonly QuoteTier[], skuCartons: number): QuoteTier | null {
  let found: QuoteTier | null = null;
  for (const tier of ascending(tiers)) if (tier.minQuantity <= skuCartons) found = tier;
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
  lines: readonly Pick<QuoteLine, "id" | "sku">[],
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
  tier: QuoteTier | null;
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
export function feeTotals(fees: readonly QuoteFee[]) {
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
  quote: Pick<Quote, "lines" | "fees">,
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

/** What a line shows read only: the accepted figures once accepted, the proposed ones before. */
export function shownLine(line: QuoteLine) {
  const accepted = line.acceptedCartons != null;
  const cartons = accepted ? line.acceptedCartons : line.cartons;
  return {
    cartons: cartons ?? null,
    units: accepted ? (line.acceptedUnits ?? line.units) : line.units,
    unitPrice: accepted ? line.acceptedUnitPrice : line.proposedUnitPrice,
    lineTotal: accepted ? line.acceptedLineTotal : line.proposedLineTotal,
    tax: accepted ? line.acceptedTax : line.proposedTax,
    tier: cartons == null ? null : tierFor(line.tiers, cartons),
  };
}

/** The totals the BE answered: the accepted ones once accepted, the proposed ones before. */
export const shownTotals = (quote: Pick<Quote, "accepted" | "proposed">) =>
  quote.accepted ?? quote.proposed ?? null;
