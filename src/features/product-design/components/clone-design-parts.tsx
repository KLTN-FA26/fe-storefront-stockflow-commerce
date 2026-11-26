"use client";

import { Skeleton } from "@/components/shared";
import { Label } from "@/components/ui/label";
import { variantLabel } from "@/lib/catalog/variant-label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

import type { CloneTarget } from "./clone-design-targets";

export function TargetsLoading() {
  return (
    <div role="status" aria-label="Đang tải các quy cách" className="space-y-1">
      {[0, 1].map((i) => (
        <Skeleton key={i} className="h-11 w-full rounded-[var(--r-md)]" />
      ))}
    </div>
  );
}

/** The variants the design can be copied to, one radio each: its name in words, the SKU small beside it. */
export function TargetChoice({
  targets,
  productTitle,
  value,
  onChange,
}: {
  targets: CloneTarget[];
  /** The product's title: a variant's name starts with it, so only what follows is shown. */
  productTitle: string;
  value: string | null;
  onChange: (sku: string) => void;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-ink-primary text-sm font-medium">Quy cách mới</legend>
      <RadioGroup value={value ?? ""} onValueChange={onChange} aria-label="Quy cách mới">
        {targets.map(({ sku, name }) => {
          const label = variantLabel({ sku, name }, productTitle);
          return (
            <Label
              key={sku}
              className="border-border-default hover:bg-bg-subtle min-h-11 cursor-pointer gap-3 rounded-[var(--r-md)] border px-3 py-1.5 text-sm"
            >
              <RadioGroupItem value={sku} aria-label={label} />
              <span className="min-w-0 flex-1">
                <span className="text-ink-primary block font-medium break-words">{label}</span>
                {label !== sku ? (
                  <span className="text-ink-tertiary block font-mono text-xs tabular-nums">
                    {sku}
                  </span>
                ) : null}
              </span>
            </Label>
          );
        })}
      </RadioGroup>
    </fieldset>
  );
}
