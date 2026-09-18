"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { STORE_ROUTES } from "@/constants";
import { Button } from "@/components/ui/button";
import { PageContainer, PageHeader, Skeleton } from "@/components/shared";
import { AddressForm } from "@/features/customer/components/address-form";
import { useUpdateAddress } from "@/features/customer/mutations";
import { useAddresses } from "@/features/customer/queries";
import type { AddressFormValues } from "@/features/customer/schemas";

export default function EditAddressPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  
  const { data: addresses, isLoading } = useAddresses();
  const updateMutation = useUpdateAddress();

  const address = addresses?.find((a) => a.id === id);

  const handleSubmit = (data: AddressFormValues) => {
    updateMutation.mutate(
      { id, data },
      {
        onSuccess: () => {
          router.push(STORE_ROUTES.account.addresses);
        },
      }
    );
  };

  if (isLoading) {
    return (
      <PageContainer className="max-w-3xl">
        <Skeleton className="h-8 w-48 mb-6" />
        <Skeleton className="h-[400px] w-full rounded-xl" />
      </PageContainer>
    );
  }

  if (!address) {
    return (
      <PageContainer className="max-w-3xl">
        <div className="p-8 text-center text-danger font-medium">Không tìm thấy địa chỉ!</div>
      </PageContainer>
    );
  }

  return (
    <PageContainer className="max-w-3xl">
      <div className="flex items-center gap-4 mb-6">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.back()}
          className="rounded-full"
        >
          <ArrowLeft className="size-5" />
        </Button>
        <PageHeader title="Sửa địa chỉ" />
      </div>

      <div className="w-full">
        <AddressForm
          defaultValues={address}
          onSubmit={handleSubmit}
          isSubmitting={updateMutation.isPending}
        />
      </div>
    </PageContainer>
  );
}
