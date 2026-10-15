import Image from "next/image";
import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";

import { PriceDisplay } from "./price-display";
import { QuantityStepper } from "./quantity-stepper";

interface CartLineItemProps {
  name: string;
  imageSrc: string;
  variant: string;
  price: number;
  quantity: number;
  maxQuantity?: number;
  unavailableReason?: string;
  onQuantityChange: (quantity: number) => void;
  onRemove: () => void;
}

export function CartLineItem({
  name,
  imageSrc,
  variant,
  price,
  quantity,
  maxQuantity,
  unavailableReason,
  onQuantityChange,
  onRemove,
}: CartLineItemProps) {
  return (
    <article className="flex gap-3 p-[var(--card-pad)] sm:gap-4">
      <div className="border-border-default bg-bg-subtle relative size-20 shrink-0 overflow-hidden rounded-[var(--r-md)] border sm:size-24">
        <Image src={imageSrc} alt={name} fill sizes="96px" className="object-cover" />
      </div>
      <div className="min-w-0 flex-1 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-ink-primary line-clamp-2 text-sm font-semibold sm:text-base">
              {name}
            </h3>
            <p className="text-ink-secondary text-xs sm:text-sm">{variant}</p>
            {unavailableReason && (
              <p className="text-danger mt-1 text-xs sm:text-sm">{unavailableReason}</p>
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
          <QuantityStepper value={quantity} max={maxQuantity} onChange={onQuantityChange} />
          <PriceDisplay price={price * quantity} size="sm" />
        </div>
      </div>
    </article>
  );
}
