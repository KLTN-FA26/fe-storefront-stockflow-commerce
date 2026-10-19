import { cn } from "@/lib/cn";

import { ProductCard, type ProductCardProps } from "./product-card";

export interface ProductGridItem extends ProductCardProps {
  id: string;
}

interface ProductGridProps {
  products: ProductGridItem[];
  columns?: 3 | 4 | undefined;
}

export function ProductGrid({ products, columns = 4 }: ProductGridProps) {
  return (
    <ul
      className={cn(
        "grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3",
        columns === 4 && "xl:grid-cols-4",
      )}
    >
      {products.map(({ id, ...card }) => (
        <li key={id}>
          <ProductCard {...card} />
        </li>
      ))}
    </ul>
  );
}
