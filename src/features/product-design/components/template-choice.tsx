"use client";

import { VariantSelector } from "@/components/storefront/variant-selector";
import { Button } from "@/components/ui/button";

import type { Customization } from "../types";

export type Template = Customization["templates"][number];

/**
 * A variant can have several print templates (and a link without a SKU several variants):
 * the customer picks one, then starts. `showSku` names the variant when the choice spans several.
 */
export function TemplateChoice({
  templates,
  value,
  onChange,
  onStart,
  starting,
  showSku,
}: {
  templates: Template[];
  value: string;
  onChange: (code: string) => void;
  onStart: () => void;
  starting: boolean;
  showSku: boolean;
}) {
  return (
    <div className="bg-bg-surface border-border-default space-y-5 rounded-[var(--r-lg)] border p-[var(--card-pad)] shadow-[var(--card-shadow)]">
      <div className="space-y-1">
        <h1 className="font-display text-ink-primary text-xl font-bold">
          Bạn muốn thiết kế mẫu nào?
        </h1>
        <p className="text-ink-secondary text-sm">
          Sản phẩm này có nhiều mẫu in. Chọn mẫu để bắt đầu, bạn có thể đổi tên thiết kế sau.
        </p>
      </div>
      <VariantSelector
        label="Chọn mẫu thiết kế"
        value={value}
        onChange={onChange}
        options={templates.map((template) => ({
          id: template.code,
          label: showSku ? `${template.name} (${template.sku})` : template.name,
        }))}
      />
      <Button
        type="button"
        className="min-h-11 w-full rounded-[var(--r-md)]"
        disabled={starting}
        onClick={onStart}
      >
        {starting ? "Đang tạo thiết kế…" : "Bắt đầu thiết kế"}
      </Button>
    </div>
  );
}
