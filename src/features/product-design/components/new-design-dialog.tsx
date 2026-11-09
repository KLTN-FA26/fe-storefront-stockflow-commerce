"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { STORE_ROUTES } from "@/constants";
import { Alert } from "@/components/shared";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/cn";

import { describeDesignError } from "../errors";
import { usePrintConfig } from "../queries";

/** What the page gives the dialog: the printable products and their variants (from the catalogue). */
export type DesignableProduct = {
  slug: string;
  title: string;
  variants: { sku: string; label: string }[];
};

const normalize = (text: string) => text.toLocaleLowerCase("vi").trim();

/** "Thiết kế mới": product (searched), then variant; the launcher opens for a variant that takes designs. */
export function NewDesignDialog({
  products,
  open,
  onOpenChange,
}: {
  products: DesignableProduct[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [slug, setSlug] = useState<string | null>(null);
  const [sku, setSku] = useState<string | null>(null);
  const product = products.find((p) => p.slug === slug) ?? null;
  const shown = products.filter((p) => normalize(p.title).includes(normalize(query)));
  const config = usePrintConfig(slug ?? "", sku ?? "", Boolean(slug && sku));
  const checking = Boolean(sku) && config.isPending;
  const accepted = config.data != null && config.data.variantStatus === "ACTIVE";
  const refused = Boolean(sku) && !checking && !config.error && !accepted;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-bg-surface border-border-default max-h-[90dvh] gap-4 overflow-y-auto rounded-[var(--r-xl)] border p-[var(--card-pad)] shadow-[var(--sh-lg)] ring-0 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-ink-primary text-lg font-semibold">Thiết kế mới</DialogTitle>
          <DialogDescription className="text-ink-secondary text-sm">
            Chọn sản phẩm in được, rồi chọn quy cách bạn muốn thiết kế.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="design-product-search" className="text-ink-primary text-sm font-medium">
            Tìm sản phẩm
          </Label>
          <Input
            id="design-product-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="min-h-11 rounded-[var(--r-md)]"
          />
          <ul aria-label="Sản phẩm in được" className="max-h-48 space-y-1 overflow-y-auto">
            {shown.map((p) => (
              <li key={p.slug}>
                <button
                  type="button"
                  aria-pressed={p.slug === slug}
                  onClick={() => {
                    setSlug(p.slug);
                    setSku(null);
                  }}
                  className={cn(
                    "text-ink-primary focus-visible:ring-accent min-h-11 w-full rounded-[var(--r-md)] border px-3 text-left text-sm outline-none focus-visible:ring-2",
                    p.slug === slug
                      ? "border-accent bg-bg-muted"
                      : "border-border-default hover:bg-bg-subtle",
                  )}
                >
                  {p.title}
                </button>
              </li>
            ))}
            {shown.length === 0 ? (
              <li className="text-ink-tertiary px-1 py-2 text-sm">
                Không tìm thấy sản phẩm phù hợp.
              </li>
            ) : null}
          </ul>
        </div>

        {product ? (
          <fieldset className="space-y-2">
            <legend className="text-ink-primary text-sm font-medium">Quy cách</legend>
            <RadioGroup value={sku ?? ""} onValueChange={setSku} aria-label="Quy cách">
              {product.variants.map((variant) => (
                <Label
                  key={variant.sku}
                  className="border-border-default hover:bg-bg-subtle min-h-11 cursor-pointer gap-3 rounded-[var(--r-md)] border px-3 text-sm"
                >
                  <RadioGroupItem value={variant.sku} aria-label={variant.label} />
                  {variant.label}
                </Label>
              ))}
            </RadioGroup>
          </fieldset>
        ) : null}

        {refused ? <Alert tone="warning">Quy cách này chưa nhận thiết kế.</Alert> : null}
        {config.error ? <Alert tone="danger">{describeDesignError(config.error)}</Alert> : null}

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            className="min-h-11 rounded-[var(--r-md)] px-4"
            onClick={() => onOpenChange(false)}
          >
            Huỷ
          </Button>
          <Button
            type="button"
            className="min-h-11 rounded-[var(--r-md)] px-4"
            disabled={!accepted}
            onClick={() => {
              if (slug && sku) router.push(STORE_ROUTES.design.newFor(slug, sku));
            }}
          >
            Bắt đầu
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
