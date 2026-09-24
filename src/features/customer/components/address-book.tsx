"use client";

import { useState } from "react";
import { Home, MapPin, Pencil, Trash2, Info } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ConfirmDialog } from "@/components/shared";

import type { CustomerAddressDto } from "../types";

interface AddressBookProps {
  addresses: CustomerAddressDto[];
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onSetDefault: (id: string) => void;
}

export function AddressBook({ addresses, onEdit, onDelete, onSetDefault }: AddressBookProps) {
  const [addressToDelete, setAddressToDelete] = useState<CustomerAddressDto | null>(null);

  const confirmDelete = () => {
    if (addressToDelete) {
      onDelete(addressToDelete.addressId);
      setAddressToDelete(null);
    }
  };

  return (
    <div className="grid gap-4">
      {addresses.map((address) => (
        <article
          key={address.addressId}
          className="border-border-default bg-bg-surface rounded-[var(--r-xl)] border p-[var(--card-pad)] shadow-sm transition-shadow hover:shadow-md"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Home className="text-accent size-4" />
                <h3 className="text-ink-primary font-semibold">{address.recipientName}</h3>
                <span className="text-ink-secondary text-sm">{address.phone}</span>
                {address.defaultAddress && (
                  <Badge className="bg-accent text-ink-inverse rounded-full">Mặc định</Badge>
                )}
              </div>
              <p className="text-ink-secondary flex gap-2 text-sm">
                <MapPin className="mt-0.5 size-4 shrink-0" />
                <span>
                  {address.line1}, {address.wardName}
                  {address.line2 ? `, ${address.line2}` : ""}
                  {`, ${address.provinceName}`}
                </span>
              </p>
              {address.postalCode && (
                <p className="text-ink-tertiary pl-6 text-sm">Mã bưu điện: {address.postalCode}</p>
              )}
            </div>

            <div className="flex items-center gap-2">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-ink-tertiary hover:text-ink-secondary cursor-help rounded-full"
                    >
                      <Info className="size-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="border-border-default bg-bg-surface text-ink-primary max-w-xs text-center shadow-md">
                    Việc sửa/xoá địa chỉ này sẽ <b>KHÔNG</b> ảnh hưởng đến các đơn hàng đang trên
                    đường giao.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="hover:bg-bg-muted rounded-full"
                onClick={() => onEdit(address.addressId)}
              >
                <Pencil className="text-ink-primary size-4" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="text-danger hover:bg-danger/10 hover:text-danger rounded-full"
                onClick={() => setAddressToDelete(address)}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          </div>

          {!address.defaultAddress && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-border-strong text-ink-primary hover:bg-bg-muted mt-4 rounded-full"
              onClick={() => onSetDefault(address.addressId)}
            >
              Đặt làm mặc định
            </Button>
          )}
        </article>
      ))}

      <ConfirmDialog
        open={!!addressToDelete}
        onOpenChange={(isOpen) => !isOpen && setAddressToDelete(null)}
        title={addressToDelete?.defaultAddress ? "Không thể xoá địa chỉ mặc định" : "Xoá địa chỉ"}
        description={
          addressToDelete?.defaultAddress
            ? "Vui lòng chọn địa chỉ khác làm mặc định trước khi xoá!"
            : "Bạn có chắc chắn muốn xoá địa chỉ này khỏi sổ địa chỉ không? Hành động này không thể hoàn tác."
        }
        confirmLabel={addressToDelete?.defaultAddress ? "Đã hiểu" : "Xoá địa chỉ"}
        cancelLabel={addressToDelete?.defaultAddress ? "Đóng" : "Hủy"}
        variant={addressToDelete?.defaultAddress ? "default" : "danger"}
        onConfirm={addressToDelete?.defaultAddress ? () => setAddressToDelete(null) : confirmDelete}
      />
    </div>
  );
}
