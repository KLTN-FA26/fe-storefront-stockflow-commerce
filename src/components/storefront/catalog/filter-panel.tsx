import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

const facets = [
  { title: "Danh mục", options: ["Áo & hoodie", "Quà tặng", "Ấn phẩm", "Doanh nghiệp"] },
  { title: "Chất liệu", options: ["Cotton", "Canvas", "Sứ", "Giấy mỹ thuật"] },
  { title: "Tình trạng", options: ["Còn hàng", "Sắp hết", "Có thiết kế riêng"] },
] as const;

const priceRanges = ["< 150K", "150K–300K", "> 300K"] as const;

export function FilterPanel() {
  return (
    <div className="divide-border-default divide-y">
      {facets.map((facet) => (
        <div key={facet.title} className="space-y-1 py-4 first:pt-0">
          <h2 className="text-ink-primary text-sm font-semibold">{facet.title}</h2>
          <div className="grid">
            {facet.options.map((option) => (
              <Label
                key={option}
                className="text-ink-secondary hover:text-ink-primary flex min-h-11 cursor-pointer items-center gap-3 text-sm font-normal"
              >
                <Checkbox />
                <span>{option}</span>
              </Label>
            ))}
          </div>
        </div>
      ))}
      <div className="space-y-3 py-4 last:pb-0">
        <h2 className="text-ink-primary text-sm font-semibold">Khoảng giá</h2>
        <div className="flex flex-wrap gap-2">
          {priceRanges.map((price) => (
            <Badge
              key={price}
              variant="secondary"
              className="border-border-default bg-bg-surface text-ink-secondary rounded-full border tabular-nums"
            >
              {price}
            </Badge>
          ))}
        </div>
      </div>
    </div>
  );
}
