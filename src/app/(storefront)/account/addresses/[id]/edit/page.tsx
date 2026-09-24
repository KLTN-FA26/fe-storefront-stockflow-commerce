"use client";

import { useRouter, useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { STORE_ROUTES } from "@/constants";
import { Button } from "@/components/ui/button";
import { PageContainer, PageHeader, Skeleton } from "@/components/shared";
import { AddressForm } from "@/features/customer/components/address-form";
import { useUpdateAddress } from "@/features/customer/mutations";
import { useAddresses } from "@/features/customer/queries";
import type { SaveAddressInput } from "@/features/customer/schemas";

export default function EditAddressPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const { data: addresses, isLoading } = useAddresses();
  const updateMutation = useUpdateAddress();

  const address = addresses?.find((a) => a.addressId === id);

  const handleSubmit = (data: SaveAddressInput) => {
    updateMutation.mutate(
      { addressId: id, data: { ...data, version: address?.version } },
      {
        onSuccess: () => {
          router.push(STORE_ROUTES.account.addresses);
        },
      },
    );
  };

  if (isLoading) {
    return (
      <PageContainer className="max-w-3xl">
        <Skeleton className="mb-6 h-8 w-48" />
        <Skeleton className="h-[400px] w-full rounded-xl" />
      </PageContainer>
    );
  }

  if (!address) {
    return (
      <PageContainer className="max-w-3xl">
        <div className="text-danger p-8 text-center font-medium">Không tìm thấy địa chỉ!</div>
      </PageContainer>
    );
  }

  return (
    <PageContainer className="max-w-3xl">
      <div className="mb-6 flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full">
          <ArrowLeft className="size-5" />
        </Button>
        <PageHeader title="Sửa địa chỉ" />
      </div>

      <div className="w-full">
        <AddressForm
          defaultValues={{
            type: address.type,
            recipientName: address.recipientName,
            phone: address.phone,
            line1: address.line1,
            line2: address.line2 ?? "",
            wardCode: address.wardCode,
            wardName: address.wardName,
            provinceCode: address.provinceCode,
            provinceName: address.provinceName,
            countryCode: address.countryCode as SaveAddressInput["countryCode"],
            postalCode: address.postalCode ?? "",
            defaultAddress: address.defaultAddress,
            version: address.version,
          }}
          onSubmit={handleSubmit}
          isSubmitting={updateMutation.isPending}
        />
      </div>
    </PageContainer>
  );
}
