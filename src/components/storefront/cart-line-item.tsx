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

export function CartLineItem({ name, imageSrc, variant, price, quantity, maxQuantity, unavailableReason, onQuantityChange, onRemove }: CartLineItemProps) {
  return (
    <article className="flex gap-4 rounded-xl bg-bg-surface p-4 shadow-md">
      <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-lg bg-bg-subtle">
        <Image src={imageSrc} alt={name} fill sizes="96px" className="object-cover" />
      </div>
      <div className="min-w-0 flex-1 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-semibold text-ink-primary">{name}</h3>
            <p className="text-sm text-ink-secondary">{variant}</p>
            {unavailableReason && <p className="mt-1 text-sm text-danger">{unavailableReason}</p>}
          </div>
          <Button type="button" size="icon" variant="ghost" className="rounded-full text-ink-tertiary hover:text-danger" onClick={onRemove}>
            <Trash2 className="h-4 w-4" />
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
