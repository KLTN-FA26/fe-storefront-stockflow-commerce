"use client";

import { useEffect, useId } from "react";

import { Alert } from "@/components/shared";
import { variantLabel } from "@/lib/catalog/variant-label";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

import { describeDesignError } from "../errors";
import { usePrintConfigs } from "../queries";
import { isPrintConfigUsable } from "../selectors";
import type { PrintConfig } from "../types";
import { RetryButton } from "./design-list-states";

type Check = { data: PrintConfig | null | undefined; isPending: boolean; isError: boolean };

/** Why a variant cannot be picked; null when it takes designs. */
function noteOf(check: Check): string | null {
  if (check.isPending) return "Đang kiểm tra…";
  if (check.isError) return "Chưa kiểm tra được";
  if (!check.data) return "Chưa nhận thiết kế";
  return isPrintConfigUsable(check.data) ? null : "Không còn nhận thiết kế";
}

/**
 * One variant, named in words (volume, material) with its SKU small beside it (ruling R13: the SKU is the label a
 * design keeps); disabled with why.
 */
function VariantOption({ sku, label, check }: { sku: string; label: string; check: Check }) {
  const noteId = useId();
  const note = noteOf(check);
  return (
    <Label className="border-border-default hover:bg-bg-subtle min-h-11 cursor-pointer gap-3 rounded-[var(--r-md)] border px-3 py-1.5 text-sm has-disabled:cursor-not-allowed has-disabled:hover:bg-transparent">
      <RadioGroupItem
        value={sku}
        disabled={note !== null}
        aria-label={label}
        {...(note ? { "aria-describedby": noteId } : {})}
      />
      <span className="min-w-0 flex-1">
        <span className="text-ink-primary block font-medium break-words">{label}</span>
        {label !== sku ? (
          <span className="text-ink-tertiary block font-mono text-xs tabular-nums">{sku}</span>
        ) : null}
      </span>
      {note ? (
        <span id={noteId} className="text-ink-tertiary ml-auto text-xs font-normal">
          {note}
        </span>
      ) : null}
    </Label>
  );
}

/**
 * The variants of the chosen product (spec §6.3): each one's print configuration is read, and only
 * a variant with a usable one can be picked; a check that failed can be tried again.
 */
export function VariantChoice({
  productSlug,
  productTitle,
  skus,
  names,
  value,
  onChange,
}: {
  productSlug: string;
  /** The product's title: a variant's name starts with it, so only what follows is shown. */
  productTitle?: string | undefined;
  skus: readonly string[];
  /** The variants' names by SKU. */
  names?: Readonly<Record<string, string>> | undefined;
  value: string | null;
  onChange: (sku: string) => void;
}) {
  const checks = usePrintConfigs(productSlug, skus);
  const failed = checks.filter((check) => check.isError);
  // One variant that takes designs is the only choice (R6): chosen for the customer once its check says so.
  const soleUsable = skus.length === 1 && noteOf(checks[0]!) === null ? skus[0] : undefined;
  useEffect(() => {
    if (soleUsable !== undefined && value === null) onChange(soleUsable);
  }, [soleUsable, value, onChange]);
  return (
    <fieldset className="space-y-2">
      <legend className="text-ink-primary text-sm font-medium">Quy cách</legend>
      <RadioGroup value={value ?? ""} onValueChange={onChange} aria-label="Quy cách">
        {skus.map((sku, i) => (
          <VariantOption
            key={sku}
            sku={sku}
            label={variantLabel({ sku, name: names?.[sku] }, productTitle)}
            check={checks[i]!}
          />
        ))}
      </RadioGroup>
      {failed.length > 0 ? (
        <div className="space-y-2">
          <Alert tone="danger">{describeDesignError(failed[0]!.error)}</Alert>
          <RetryButton
            onRetry={() => failed.forEach((check) => void check.refetch())}
            retrying={checks.some((check) => check.isFetching)}
          />
        </div>
      ) : null}
    </fieldset>
  );
}
