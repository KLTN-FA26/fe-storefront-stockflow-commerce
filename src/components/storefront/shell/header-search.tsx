import { CatalogSearchBox } from "@/features/catalog/components/catalog-search-box";

type HeaderSearchProps = { className?: string | undefined };

export function HeaderSearch({ className }: HeaderSearchProps) {
  return <CatalogSearchBox className={className} />;
}
