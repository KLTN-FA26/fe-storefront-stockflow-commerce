"use client";

import { Skeleton } from "@/components/shared";
import { Label } from "@/components/ui/label";
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

/** The variants the design can be copied to, one radio each, labelled by SKU. */
export function TargetChoice({
  targets,
  value,
  onChange,
}: {
  targets: CloneTarget[];
  value: string | null;
  onChange: (sku: string) => void;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-ink-primary text-sm font-medium">Quy cách mới</legend>
      <RadioGroup value={value ?? ""} onValueChange={onChange} aria-label="Quy cách mới">
        {targets.map(({ sku }) => (
          <Label
            key={sku}
            className="border-border-default hover:bg-bg-subtle min-h-11 cursor-pointer gap-3 rounded-[var(--r-md)] border px-3 text-sm"
          >
            <RadioGroupItem value={sku} aria-label={sku} />
            <span className="text-ink-primary font-mono tabular-nums">{sku}</span>
          </Label>
        ))}
      </RadioGroup>
    </fieldset>
  );
}
