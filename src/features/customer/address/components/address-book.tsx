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
      <p className="text-ink-tertiary mb-6 text-sm">
        Sửa hoặc xoá địa chỉ không ảnh hưởng đến các đơn hàng đã đặt.
      </p>
      <div className="space-y-8">
        {groupAddressesByType(addresses).map((group) => (
          <section
            key={group.type}
            aria-labelledby={`address-group-${group.type}`}
            className="space-y-4"
          >
            <h2
              id={`address-group-${group.type}`}
              className="font-display text-ink-primary text-lg font-semibold"
            >
              Địa chỉ {ADDRESS_TYPE_LABELS[group.type].toLowerCase()}
            </h2>
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

function AddressCard({ address, busy, onEdit, onDelete, onSetDefault }: AddressCardProps) {
  return (
    <article className="border-border-default bg-bg-surface rounded-[var(--r-xl)] border p-[var(--card-pad)] shadow-sm transition-shadow hover:shadow-md">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-ink-primary font-semibold">{address.recipientName}</h3>
            <span className="text-ink-secondary text-sm tabular-nums">{address.phone}</span>
            <Badge variant="secondary" className="rounded-full">
              {ADDRESS_TYPE_LABELS[address.type]}
            </Badge>
            {address.defaultAddress && (
              <Badge className="bg-accent text-ink-inverse rounded-full">Mặc định</Badge>
            )}
          </div>
          <p className="text-ink-secondary flex gap-2 text-sm">
            <MapPin aria-hidden className="mt-0.5 size-4 shrink-0" />
            <span>{formatAddressLine(address)}</span>
          </p>
          {address.postalCode && (
            <p className="text-ink-tertiary pl-6 text-sm tabular-nums">
              Mã bưu chính: {address.postalCode}
            </p>
          )}
        </div>

        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            className="size-11 rounded-full"
            aria-label={`Sửa địa chỉ của ${address.recipientName}`}
            onClick={onEdit}
          >
            <Pencil aria-hidden className="text-ink-primary size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="text-danger hover:bg-bg-muted hover:text-danger size-11 rounded-full"
            aria-label={`Xoá địa chỉ của ${address.recipientName}`}
            disabled={busy}
            onClick={onDelete}
          >
            <Trash2 aria-hidden className="size-4" />
          </Button>
        </div>
      </div>

      {!address.defaultAddress && (
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          className="border-border-strong text-ink-primary hover:bg-bg-muted mt-4 h-11 rounded-full"
          aria-label={`Đặt địa chỉ của ${address.recipientName} làm mặc định`}
          onClick={onSetDefault}
        >
          Đặt làm mặc định
        </Button>
      )}
    </article>
  );
}
