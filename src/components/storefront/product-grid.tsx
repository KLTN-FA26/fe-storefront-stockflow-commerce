import { cn } from "@/lib/cn";

import { ProductCard } from "./product-card";

interface ProductGridItem {
  id: string;
  href: string;
  name: string;
  imageSrc: string;
  price: number;
  compareAtPrice?: number;
  badge?: string;
  rating?: number;
  reviewCount?: number;
  availability?: "in-stock" | "low-stock" | "out-of-stock";
}

interface ProductGridProps {
  products: ProductGridItem[];
  columns?: 3 | 4 | undefined;
}

export function ProductGrid({ products, columns = 4 }: ProductGridProps) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3",
        columns === 4 && "xl:grid-cols-4",
      )}
    >
      {products.map((product) => (
        <ProductCard key={product.id} {...product} />
      ))}
    </div>
  );
}
