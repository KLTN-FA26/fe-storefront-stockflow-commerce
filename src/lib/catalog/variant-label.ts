/**
 * What a customer reads for a variant ("quy cách", kltn-docs 13 §4.4: volume, material, ...): the name the BE sends
 * with it, never the bare SKU code alone. The BE names a variant after its product ("Ly giấy 2 lớp in logo - 12 oz");
 * under a page that already shows the product's title only the part after it is useful, so that prefix is dropped when
 * it is there. Without a name the SKU stands in (an older BE sends none).
 */
export function variantLabel(
  variant: { sku: string; name?: string | null | undefined },
  productTitle?: string | null,
): string {
  const name = variant.name?.trim();
  if (!name) return variant.sku;
  const title = productTitle?.trim();
  if (title && name.length > title.length && name.toLowerCase().startsWith(title.toLowerCase())) {
    const rest = name.slice(title.length).replace(/^[\s\-\u2013\u2014:·]+/, "");
    if (rest) return rest;
  }
  return name;
}
