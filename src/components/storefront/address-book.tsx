import { Home, MapPin, Pencil, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { SurfaceCard } from "./layout";

interface AddressBookItem {
  id: string;
  name: string;
  phone: string;
  line1: string;
  ward: string;
  district: string;
  province: string;
  default?: boolean;
}

interface AddressBookProps {
  addresses: AddressBookItem[];
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onSetDefault: (id: string) => void;
}

export function AddressBook({ addresses, onEdit, onDelete, onSetDefault }: AddressBookProps) {
  return (
    <div className="grid gap-3">
      {addresses.map((address) => (
        <SurfaceCard as="article" key={address.id}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Home className="text-accent h-4 w-4" />
                <h3 className="font-semibold">{address.name}</h3>
                <span className="text-ink-secondary text-sm">{address.phone}</span>
                {address.default && <Badge className="rounded-full">Mặc định</Badge>}
              </div>
              <p className="text-ink-secondary flex gap-2 text-sm">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  {address.line1}, {address.ward}, {address.district}, {address.province}
                </span>
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label="Sửa địa chỉ"
                className="size-11 rounded-full"
                onClick={() => onEdit(address.id)}
              >
                <Pencil className="h-4 w-4" aria-hidden="true" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label="Xóa địa chỉ"
                className="text-danger size-11 rounded-full"
                onClick={() => onDelete(address.id)}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
          {!address.default && (
            <Button
              type="button"
              variant="secondary"
              className="mt-4 min-h-11 rounded-[var(--r-md)]"
              onClick={() => onSetDefault(address.id)}
            >
              Đặt làm mặc định
            </Button>
          )}
        </SurfaceCard>
      ))}
    </div>
  );
}
