"use client";

import Link from "next/link";
import { useState } from "react";

import { STORE_ROUTES } from "@/constants";

import { useVietnamAddresses } from "@/hooks/use-vietnam-addresses";

import { Button } from "@/components/ui/button";
import { AddressForm } from "@/components/storefront/address-form";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function EditAddressPage({ params }: PageProps) {
  void params;
  const [address, setAddress] = useState({
    name: "Nguyễn An",
    phone: "0900000000",
    province: "",
    ward: "",
    line1: "12 Nguyễn Huệ",
  });
  const { provinces, wards, loading } = useVietnamAddresses(address.province);

  return (
    <section className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-accent">Sổ địa chỉ</p>
        <h1 className="font-display text-3xl font-bold">Chỉnh sửa địa chỉ</h1>
        <p className="mt-2 text-ink-secondary">Cập nhật thông tin nhận hàng dùng cho checkout.</p>
      </div>
      <AddressForm value={address} provinces={provinces} wards={wards} loading={loading} onChange={setAddress} />
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button asChild variant="secondary" className="rounded-full">
          <Link href={STORE_ROUTES.account.addresses}>Hủy</Link>
        </Button>
        <Button className="rounded-full">Lưu địa chỉ</Button>
      </div>
    </section>
  );
}
