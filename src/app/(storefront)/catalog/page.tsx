import { Filter, SlidersHorizontal } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { EmptyState } from "@/components/shared";
import { FilterPanel } from "@/components/storefront/catalog/filter-panel";
import { storefrontProducts } from "@/components/storefront/demo-commerce-data";
import { PageShell } from "@/components/storefront/layout";
import { ProductGrid } from "@/components/storefront/product-grid";

export default function CatalogPage() {
  return (
    <PageShell
      title="Sản phẩm in ấn và quà tặng tùy biến"
      subtitle="Duyệt sản phẩm, chọn biến thể, kiểm tra tồn kho và bắt đầu thiết kế riêng nếu cần."
    >
      <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-8">
        <aside className="hidden lg:sticky lg:top-[var(--sticky-top)] lg:-ml-1 lg:block lg:max-h-[calc(100dvh-var(--sticky-top)-1rem)] lg:self-start lg:overflow-y-auto lg:pr-2 lg:pl-1">
          <div className="border-border-default mb-4 flex items-center gap-2 border-b pb-3">
            <SlidersHorizontal className="text-accent size-4" aria-hidden="true" />
            <h2 className="text-ink-primary text-base font-semibold">Tinh chỉnh tìm kiếm</h2>
          </div>
          <FilterPanel />
        </aside>

        <div className="min-w-0 space-y-4">
          <div className="bg-bg-base border-border-default sticky top-[var(--header-h)] z-30 -mx-4 flex flex-col gap-2 border-b px-4 py-3 sm:-mx-6 sm:px-6 lg:static lg:z-auto lg:mx-0 lg:flex-row lg:items-center lg:justify-between lg:gap-4 lg:px-0 lg:pt-0">
            <div className="flex items-center gap-2 lg:order-last">
              <Sheet>
                <SheetTrigger asChild>
                  <Button
                    type="button"
                    variant="secondary"
                    className="min-h-11 flex-1 rounded-[var(--r-md)] lg:hidden"
                  >
                    <Filter className="h-4 w-4" /> Bộ lọc
                  </Button>
                </SheetTrigger>
                <SheetContent
                  side="left"
                  className="border-border-default bg-bg-surface text-ink-primary"
                >
                  <SheetHeader>
                    <SheetTitle>Bộ lọc sản phẩm</SheetTitle>
                  </SheetHeader>
                  <div className="overflow-y-auto px-4 pb-6">
                    <FilterPanel />
                  </div>
                </SheetContent>
              </Sheet>
              <Select defaultValue="popular">
                <SelectTrigger className="border-border-default bg-bg-surface dark:bg-bg-surface dark:hover:bg-bg-muted text-ink-primary min-h-11 flex-1 rounded-[var(--r-md)] lg:w-48 lg:flex-none">
                  <SelectValue placeholder="Sắp xếp" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="popular">Phổ biến</SelectItem>
                  <SelectItem value="newest">Mới nhất</SelectItem>
                  <SelectItem value="price-asc">Giá tăng dần</SelectItem>
                  <SelectItem value="price-desc">Giá giảm dần</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex min-w-0 [scrollbar-width:none] items-center gap-3 overflow-x-auto lg:flex-wrap lg:gap-y-2 lg:overflow-visible">
              <p className="text-ink-secondary shrink-0 text-sm whitespace-nowrap">
                <span className="text-ink-primary font-semibold tabular-nums">
                  {storefrontProducts.length}
                </span>{" "}
                sản phẩm phù hợp
              </p>
              <div className="flex shrink-0 gap-2 lg:flex-wrap">
                {["Custom", "Còn hàng", "Giao nhanh"].map((chip) => (
                  <Badge
                    key={chip}
                    variant="secondary"
                    className="border-border-default bg-bg-surface text-ink-secondary rounded-full border"
                  >
                    {chip}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
          {storefrontProducts.length ? (
            <ProductGrid products={storefrontProducts} />
          ) : (
            <EmptyState
              title="Không có sản phẩm"
              description="Thử đổi bộ lọc hoặc từ khóa tìm kiếm."
            />
          )}
        </div>
      </div>
    </PageShell>
  );
}
