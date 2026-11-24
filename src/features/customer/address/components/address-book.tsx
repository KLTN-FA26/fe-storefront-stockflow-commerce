"use client";

import { useState } from "react";
import { MapPin, Pencil, Trash2 } from "lucide-react";

import { ConfirmDialog } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { ADDRESS_TYPE_LABELS, formatAddressLine, groupAddressesByType } from "../selectors";
import type { CustomerAddressDto } from "../types";

interface AddressBookProps {
  addresses: readonly CustomerAddressDto[];
  onEdit: (addressId: string) => void;
  onDelete: (addressId: string) => void;
  onSetDefault: (addressId: string) => void;
  /** Disables row actions while a delete/set-default request is in flight. */
  busy?: boolean;
}

export function AddressBook({
  addresses,
  onEdit,
  onDelete,
  onSetDefault,
  busy = false,
}: AddressBookProps) {
  const [toDelete, setToDelete] = useState<CustomerAddressDto | null>(null);
  const typeLabel = toDelete ? ADDRESS_TYPE_LABELS[toDelete.type].toLowerCase() : "";

  return (
    <>
      {/* The two kinds side by side on a wide screen, each its own column of cards. */}
      <div className="grid gap-8 lg:grid-cols-2 lg:gap-6">
        {groupAddressesByType(addresses).map((group) => (
          <section
            key={group.type}
            aria-labelledby={`address-group-${group.type}`}
            className="space-y-3"
          >
            <h2
              id={`address-group-${group.type}`}
              className="font-display text-ink-primary text-base font-semibold"
            >
              Địa chỉ {ADDRESS_TYPE_LABELS[group.type].toLowerCase()}
            </h2>
            <div className="space-y-3">
              {group.items.map((address) => (
                <AddressCard
                  key={address.addressId}
                  address={address}
                  busy={busy}
                  onEdit={() => onEdit(address.addressId)}
                  onDelete={() => setToDelete(address)}
                  onSetDefault={() => onSetDefault(address.addressId)}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(open) => !open && setToDelete(null)}
        title="Xoá địa chỉ"
        description={
          toDelete?.defaultAddress
            ? `Đây là địa chỉ ${typeLabel} mặc định. Sau khi xoá, hệ thống sẽ tự chọn một địa chỉ ${typeLabel} khác (nếu có) làm mặc định.`
            : "Bạn có chắc muốn xoá địa chỉ này khỏi sổ địa chỉ? Hành động này không thể hoàn tác."
        }
        confirmLabel="Xoá địa chỉ"
        cancelLabel="Huỷ"
        variant="danger"
        onConfirm={() => {
          if (toDelete) onDelete(toDelete.addressId);
          setToDelete(null);
        }}
      />
    </>
  );
}

interface AddressCardProps {
  address: CustomerAddressDto;
  busy: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onSetDefault: () => void;
}

/**
 * One address: who and which phone, the address, and the default mark on the left; edit and delete as icons at the top
 * right; "Đặt làm mặc định" as a quiet action under it when it is not the default. Its kind is the column's heading.
 */
function AddressCard({ address, busy, onEdit, onDelete, onSetDefault }: AddressCardProps) {
  return (
    <article className="bg-bg-surface border-border-default hover:border-border-strong flex gap-3 rounded-[var(--r-lg)] border py-3 pr-2 pl-[var(--card-pad)] transition-colors">
      <div className="min-w-0 flex-1 space-y-1.5 py-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h3 className="text-ink-primary font-semibold">{address.recipientName}</h3>
          <span className="text-ink-secondary text-sm tabular-nums">{address.phone}</span>
          {address.defaultAddress && (
            <Badge className="bg-accent/10 text-accent rounded-full">Mặc định</Badge>
          )}
        </div>
        <p className="text-ink-secondary flex gap-2 text-sm">
          <MapPin aria-hidden className="text-ink-tertiary mt-0.5 size-4 shrink-0" />
          <span>{formatAddressLine(address)}</span>
        </p>
        {address.postalCode && (
          <p className="text-ink-tertiary pl-6 text-sm tabular-nums">
            Mã bưu chính: {address.postalCode}
          </p>
        )}
        {!address.defaultAddress && (
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            className="text-accent hover:text-accent -ml-2 h-11 rounded-[var(--r-md)] px-2 text-sm font-medium hover:bg-transparent hover:underline"
            aria-label={`Đặt địa chỉ của ${address.recipientName} làm mặc định`}
            onClick={onSetDefault}
          >
            Đặt làm mặc định
          </Button>
        )}
      </div>

      <div className="flex shrink-0 items-start gap-0.5">
        <Button
          type="button"
          variant="ghost"
          className="text-ink-tertiary hover:text-ink-primary hover:bg-bg-subtle size-11 rounded-[var(--r-md)]"
          aria-label={`Sửa địa chỉ của ${address.recipientName}`}
          onClick={onEdit}
        >
          <Pencil aria-hidden className="size-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="text-ink-tertiary hover:text-danger hover:bg-bg-subtle size-11 rounded-[var(--r-md)]"
          aria-label={`Xoá địa chỉ của ${address.recipientName}`}
          disabled={busy}
          onClick={onDelete}
        >
          <Trash2 aria-hidden className="size-4" />
        </Button>
      </div>
    </article>
  );
}
