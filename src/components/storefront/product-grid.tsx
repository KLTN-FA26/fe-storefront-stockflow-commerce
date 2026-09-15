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
}

export function ProductGrid({ products }: ProductGridProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
      {products.map((product) => <ProductCard key={product.id} {...product} />)}
    </div>
  );
}
