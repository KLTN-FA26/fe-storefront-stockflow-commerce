"use client";

import { useId } from "react";

import { Alert } from "@/components/shared";
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

/** One variant, labelled by its SKU (ruling R13: the label a design keeps); disabled with why. */
function VariantOption({ sku, check }: { sku: string; check: Check }) {
  const noteId = useId();
  const note = noteOf(check);
  return (
    <Label className="border-border-default hover:bg-bg-subtle min-h-11 cursor-pointer gap-3 rounded-[var(--r-md)] border px-3 text-sm has-disabled:cursor-not-allowed has-disabled:hover:bg-transparent">
      <RadioGroupItem
        value={sku}
        disabled={note !== null}
        aria-label={sku}
        {...(note ? { "aria-describedby": noteId } : {})}
      />
      <span className="text-ink-primary font-mono tabular-nums">{sku}</span>
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
  skus,
  value,
  onChange,
}: {
  productSlug: string;
  skus: readonly string[];
  value: string | null;
  onChange: (sku: string) => void;
}) {
  const checks = usePrintConfigs(productSlug, skus);
  const failed = checks.filter((check) => check.isError);
  return (
    <fieldset className="space-y-2">
      <legend className="text-ink-primary text-sm font-medium">Quy cách</legend>
      <RadioGroup value={value ?? ""} onValueChange={onChange} aria-label="Quy cách">
        {skus.map((sku, i) => (
          <VariantOption key={sku} sku={sku} check={checks[i]!} />
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
