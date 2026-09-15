import { Home, MapPin, Pencil, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

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
        <article key={address.id} className="rounded-xl bg-bg-surface p-[var(--card-pad)] shadow-md">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Home className="h-4 w-4 text-accent" />
                <h3 className="font-semibold">{address.name}</h3>
                <span className="text-sm text-ink-secondary">{address.phone}</span>
                {address.default && <Badge className="rounded-full">Mặc định</Badge>}
              </div>
              <p className="flex gap-2 text-sm text-ink-secondary">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{address.line1}, {address.ward}, {address.district}, {address.province}</span>
              </p>
            </div>
            <div className="flex gap-2">
              <Button type="button" size="icon" variant="ghost" className="rounded-full" onClick={() => onEdit(address.id)}><Pencil className="h-4 w-4" /></Button>
              <Button type="button" size="icon" variant="ghost" className="rounded-full text-danger" onClick={() => onDelete(address.id)}><Trash2 className="h-4 w-4" /></Button>
            </div>
          </div>
          {!address.default && <Button type="button" variant="secondary" className="mt-4 rounded-full" onClick={() => onSetDefault(address.id)}>Đặt làm mặc định</Button>}
        </article>
      ))}
    </div>
  );
}
