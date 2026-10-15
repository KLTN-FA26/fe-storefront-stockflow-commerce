"use client";

import { Button } from "@/components/ui/button";

interface VariantOption {
  id: string;
  label: string;
  value?: string;
  disabled?: boolean;
}

interface VariantSelectorProps {
  label: string;
  options: VariantOption[];
  value?: string;
  onChange: (value: string) => void;
  type?: "text" | "color";
}

export function VariantSelector({
  label,
  options,
  value,
  onChange,
  type = "text",
}: VariantSelectorProps) {
  return (
    <fieldset className="space-y-3">
      <legend className="text-ink-primary text-sm font-semibold">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <Button
            key={option.id}
            type="button"
            variant={value === option.id ? "default" : "secondary"}
            disabled={option.disabled}
            className="min-h-11 rounded-full"
            onClick={() => onChange(option.id)}
          >
            {type === "color" && (
              <span
                className="border-border-default h-4 w-4 rounded-full border"
                style={{ backgroundColor: option.value ?? option.label }}
              />
            )}
            {option.label}
          </Button>
        ))}
      </div>
    </fieldset>
  );
}
