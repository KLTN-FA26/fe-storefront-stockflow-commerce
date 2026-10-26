import Image from "next/image";
import { ImageOff, Trash2 } from "lucide-react";

import { isRemoteImage } from "@/lib/remote-image";
import { Button } from "@/components/ui/button";

import { PriceDisplay } from "./price-display";
import { QuantityStepper } from "./quantity-stepper";

interface CartLineItemProps {
  name: string;
  imageSrc?: string | undefined;
  variant: string;
  /** The line total; absent while the customer's price is unknown. */
  total?: number | undefined;
  /** Unit price shown under the quantity, for a quick read of tier pricing. */
  unitPrice?: number | undefined;
  quantity: number;
  /** The price list's minimum order quantity (kltn-docs 13 BR-05). */
  minQuantity?: number | undefined;
  /** What stops this line from being ordered; shown in red under the name. */
  issue?: string | undefined;
  onQuantityChange: (quantity: number) => void;
  onRemove: () => void;
}

export function CartLineItem({
  name,
  imageSrc,
  variant,
  total,
  unitPrice,
  quantity,
  minQuantity,
  issue,
  onQuantityChange,
  onRemove,
}: CartLineItemProps) {
  return (
    <article className="flex gap-3 p-[var(--card-pad)] sm:gap-4">
      <div className="border-border-default bg-bg-subtle relative size-20 shrink-0 overflow-hidden rounded-[var(--r-md)] border sm:size-24">
        {imageSrc ? (
          <Image
            src={imageSrc}
            alt=""
            fill
            unoptimized={isRemoteImage(imageSrc)}
            sizes="96px"
            className="object-contain"
          />
        ) : (
          <span className="text-ink-tertiary absolute inset-0 flex items-center justify-center">
            <ImageOff className="size-6" aria-hidden="true" />
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-ink-primary line-clamp-2 text-sm font-semibold sm:text-base">
              {name}
            </h3>
            <p className="text-ink-secondary font-mono text-xs break-all sm:text-sm">{variant}</p>
            {issue && (
              <p role="alert" className="text-danger mt-1 text-xs sm:text-sm">
                {issue}
              </p>
            )}
          </div>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label={`Xoá ${name}`}
            className="text-ink-tertiary hover:text-danger focus-visible:ring-accent -mt-2 -mr-2 size-11 shrink-0 rounded-full focus-visible:ring-2"
            onClick={onRemove}
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <QuantityStepper
            value={quantity}
            min={minQuantity ?? 1}
            label={`Số lượng ${name}`}
            onChange={onQuantityChange}
          />
          <div className="text-right">
            {typeof total === "number" ? <PriceDisplay price={total} size="sm" /> : null}
            {typeof unitPrice === "number" ? (
              <p className="text-ink-tertiary text-xs tabular-nums">
                {new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(
                  unitPrice,
                )}{" "}
                / đơn vị
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}
