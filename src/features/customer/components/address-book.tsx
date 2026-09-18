"use client";

import { useState } from "react";
import { Home, MapPin, Pencil, Trash2, Info } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ConfirmDialog } from "@/components/shared";

import type { Address } from "../types";

interface AddressBookProps {
  addresses: Address[];
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onSetDefault: (id: string) => void;
}

export function AddressBook({ addresses, onEdit, onDelete, onSetDefault }: AddressBookProps) {
  const [addressToDelete, setAddressToDelete] = useState<Address | null>(null);

  const confirmDelete = () => {
    if (addressToDelete) {
      onDelete(addressToDelete.id);
      setAddressToDelete(null);
    }
  };

  return (
    <div className="grid gap-4">
      {addresses.map((address) => (
        <article
          key={address.id}
          className="rounded-[var(--r-xl)] border border-border-default bg-bg-surface p-[var(--card-pad)] shadow-sm transition-shadow hover:shadow-md"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Home className="size-4 text-accent" />
                <h3 className="font-semibold text-ink-primary">{address.recipientName}</h3>
                <span className="text-sm text-ink-secondary">{address.recipientPhone}</span>
                {address.isDefault && (
                  <Badge className="rounded-full bg-accent text-ink-inverse">Mặc định</Badge>
                )}
              </div>
              <p className="flex gap-2 text-sm text-ink-secondary">
                <MapPin className="mt-0.5 size-4 shrink-0" />
                <span>
                  {address.line1}, {address.ward}
                  {address.city ? `, ${address.city}` : ""}
                  {`, ${address.province}`}
                </span>
              </p>
              {address.postalCode && (
                <p className="text-sm text-ink-tertiary pl-6">
                  Mã bưu điện: {address.postalCode}
                </p>
              )}
            </div>

            <div className="flex items-center gap-2">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="rounded-full text-ink-tertiary cursor-help hover:text-ink-secondary">
                      <Info className="size-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs text-center border-border-default bg-bg-surface text-ink-primary shadow-md">
                    Việc sửa/xoá địa chỉ này sẽ <b>KHÔNG</b> ảnh hưởng đến các đơn hàng đang trên đường giao.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="rounded-full hover:bg-bg-muted"
                onClick={() => onEdit(address.id)}
              >
                <Pencil className="size-4 text-ink-primary" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="rounded-full text-danger hover:bg-danger/10 hover:text-danger"
                onClick={() => setAddressToDelete(address)}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          </div>

          {!address.isDefault && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-4 rounded-full border-border-strong text-ink-primary hover:bg-bg-muted"
              onClick={() => onSetDefault(address.id)}
            >
              Đặt làm mặc định
            </Button>
          )}
        </article>
      ))}

      <ConfirmDialog
        open={!!addressToDelete}
        onOpenChange={(isOpen) => !isOpen && setAddressToDelete(null)}
        title={addressToDelete?.isDefault ? "Không thể xoá địa chỉ mặc định" : "Xoá địa chỉ"}
        description={
          addressToDelete?.isDefault
            ? "Vui lòng chọn địa chỉ khác làm mặc định trước khi xoá!"
            : "Bạn có chắc chắn muốn xoá địa chỉ này khỏi sổ địa chỉ không? Hành động này không thể hoàn tác."
        }
        confirmLabel={addressToDelete?.isDefault ? "Đã hiểu" : "Xoá địa chỉ"}
        cancelLabel={addressToDelete?.isDefault ? "Đóng" : "Hủy"}
        variant={addressToDelete?.isDefault ? "default" : "danger"}
        onConfirm={addressToDelete?.isDefault ? () => setAddressToDelete(null) : confirmDelete}
      />
    </div>
  );
}
