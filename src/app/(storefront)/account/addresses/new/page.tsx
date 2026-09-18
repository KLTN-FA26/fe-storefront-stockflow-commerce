"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { STORE_ROUTES } from "@/constants";
import { Button } from "@/components/ui/button";
import { PageContainer, PageHeader } from "@/components/shared";
import { AddressForm } from "@/features/customer/components/address-form";
import { useCreateAddress } from "@/features/customer/mutations";
import type { AddressFormValues } from "@/features/customer/schemas";

export default function NewAddressPage() {
  const router = useRouter();
  const createMutation = useCreateAddress();

  const handleSubmit = (data: AddressFormValues) => {
    createMutation.mutate(data, {
      onSuccess: () => {
        router.push(STORE_ROUTES.account.addresses);
      },
    });
  };

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
        <PageHeader title="Thêm địa chỉ mới" />
      </div>

      <div className="w-full">
        <AddressForm
          onSubmit={handleSubmit}
          isSubmitting={createMutation.isPending}
        />
      </div>
    </PageContainer>
  );
}
