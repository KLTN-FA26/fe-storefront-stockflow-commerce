"use client";

import { useRouter } from "next/navigation";

import { STORE_ROUTES } from "@/constants";

import { AddressBook } from "@/components/storefront/address-book";

const addresses = [{ id: "a1", name: "Nguyễn An", phone: "0900000000", line1: "12 Nguyễn Huệ", ward: "Bến Nghé", district: "Quận 1", province: "TP. Hồ Chí Minh", default: true }, { id: "a2", name: "Nguyễn An", phone: "0900000000", line1: "1 Võ Văn Ngân", ward: "Linh Chiểu", district: "Thủ Đức", province: "TP. Hồ Chí Minh" }];

export default function AddressesPage() {
  const router = useRouter();

  return (
    <section className="mx-auto w-full max-w-4xl space-y-4 px-4 py-8 sm:px-6 lg:px-8">
      <div><h1 className="font-display text-3xl font-bold">Sổ địa chỉ</h1><p className="text-ink-secondary">Địa chỉ Việt Nam 3 cấp cho checkout.</p></div>
      <AddressBook addresses={addresses} onEdit={(id) => router.push(`${STORE_ROUTES.account.addresses}/${id}/edit`)} onDelete={() => undefined} onSetDefault={() => undefined} />
    </section>
  );
}
