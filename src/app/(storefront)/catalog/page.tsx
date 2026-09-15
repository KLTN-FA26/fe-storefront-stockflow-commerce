import { Filter, SlidersHorizontal } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { EmptyState } from "@/components/shared";
import { ProductGrid } from "@/components/storefront/product-grid";
import { storefrontProducts } from "@/components/storefront/demo-commerce-data";

const facets = [
  { title: "Danh mục", options: ["Áo & hoodie", "Quà tặng", "Ấn phẩm", "Doanh nghiệp"] },
  { title: "Chất liệu", options: ["Cotton", "Canvas", "Sứ", "Giấy mỹ thuật"] },
  { title: "Tình trạng", options: ["Còn hàng", "Sắp hết", "Có thiết kế riêng"] },
] as const;

function FilterPanel() {
  return (
    <div className="space-y-6">
      {facets.map((facet) => (
        <div key={facet.title} className="space-y-3">
          <h2 className="font-semibold text-ink-primary">{facet.title}</h2>
          <div className="grid gap-3">
            {facet.options.map((option) => (
              <Label key={option} className="flex cursor-pointer items-center gap-3 text-sm text-ink-secondary">
                <Checkbox />
                <span>{option}</span>
              </Label>
            ))}
          </div>
        </div>
      ))}
      <div className="space-y-3">
        <h2 className="font-semibold text-ink-primary">Khoảng giá</h2>
        <div className="flex flex-wrap gap-2">
          {["< 150K", "150K–300K", "> 300K"].map((price) => <Badge key={price} variant="secondary" className="rounded-full">{price}</Badge>)}
        </div>
      </div>
    </div>
  );
}

export default function CatalogPage() {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <section className="rounded-[var(--r-xl)] bg-bg-surface p-[var(--card-pad)] shadow-md">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <Badge className="rounded-full bg-accent/10 text-accent hover:bg-accent/10">Catalog TMĐT</Badge>
            <h1 className="mt-4 font-display text-4xl font-bold">Sản phẩm in ấn và quà tặng tùy biến</h1>
            <p className="mt-3 text-ink-secondary">Duyệt sản phẩm, chọn biến thể, kiểm tra tồn kho và bắt đầu thiết kế riêng nếu cần.</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Sheet>
              <SheetTrigger asChild>
                <Button type="button" variant="secondary" className="rounded-full lg:hidden">
                  <Filter className="h-4 w-4" /> Bộ lọc
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="border-border-default bg-bg-surface text-ink-primary">
                <SheetHeader><SheetTitle>Bộ lọc sản phẩm</SheetTitle></SheetHeader>
                <div className="px-4"><FilterPanel /></div>
              </SheetContent>
            </Sheet>
            <Select defaultValue="popular">
              <SelectTrigger className="h-10 w-full rounded-full border-border-default bg-bg-surface text-ink-primary sm:w-48">
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
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <aside className="hidden rounded-[var(--r-xl)] bg-bg-surface p-[var(--card-pad)] shadow-md lg:block">
          <div className="mb-5 flex items-center gap-2">
            <SlidersHorizontal className="h-5 w-5 text-accent" />
            <h2 className="font-display text-xl font-semibold">Tinh chỉnh tìm kiếm</h2>
          </div>
          <FilterPanel />
        </aside>
        <div className="space-y-4">
          <div className="flex flex-col gap-3 rounded-[var(--r-lg)] bg-bg-surface p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-ink-secondary"><span className="font-semibold text-ink-primary">{storefrontProducts.length}</span> sản phẩm phù hợp</p>
            <div className="flex flex-wrap gap-2">
              {["Custom", "Còn hàng", "Giao nhanh"].map((chip) => <Badge key={chip} variant="secondary" className="rounded-full">{chip}</Badge>)}
            </div>
          </div>
          {storefrontProducts.length ? <ProductGrid products={storefrontProducts} /> : <EmptyState title="Không có sản phẩm" description="Thử đổi bộ lọc hoặc từ khóa tìm kiếm." />}
        </div>
      </section>
    </div>
  );
}
