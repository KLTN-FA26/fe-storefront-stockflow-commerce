import { attributeText } from "../selectors";
import type { CatalogProduct } from "../types";

/**
 * Brand, category and descriptive attributes of a product (BE #493, ADR-0013). Each part shows only when the BE sends
 * it; nothing at all for an older BE. The category is text: the storefront has no category page to link to yet.
 */
export function ProductFacts({ product }: { product: CatalogProduct }) {
  const facts = [
    ...(product.brand ? [{ label: "Thương hiệu", value: product.brand.name }] : []),
    ...(product.category ? [{ label: "Danh mục", value: product.category.name }] : []),
    ...(product.attributes ?? [])
      .map((attribute) => ({ label: attribute.name, value: attributeText(attribute) }))
      .filter((fact) => fact.value !== ""),
  ];
  if (facts.length === 0) return null;
  return (
    <section
      aria-label="Thông số sản phẩm"
      className="border-border-default bg-bg-surface rounded-[var(--r-lg)] border p-[var(--card-pad)] shadow-[var(--sh-sm)]"
    >
      <h2 className="text-ink-primary mb-3 text-base font-semibold">Thông số</h2>
      <dl className="divide-border-default divide-y text-sm">
        {facts.map((fact) => (
          <div key={fact.label} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3 py-2">
            <dt className="text-ink-tertiary">{fact.label}</dt>
            <dd className="text-ink-primary">{fact.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
