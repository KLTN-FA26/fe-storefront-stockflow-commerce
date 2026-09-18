"use client";

import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

import { STORE_ROUTES } from "@/constants";
import { Button } from "@/components/ui/button";
import { PageContainer, PageHeader, EmptyState } from "@/components/shared";
import { AddressBook } from "@/features/customer/components/address-book";
import { useAddresses } from "@/features/customer/queries";
import { useDeleteAddress as useDeleteMutation, useSetAddressDefault as useSetDefaultMutation } from "@/features/customer/mutations";

export default function AddressesPage() {
  const router = useRouter();

  const { data: addresses, isLoading, error } = useAddresses();
  const deleteMutation = useDeleteMutation();
  const setDefaultMutation = useSetDefaultMutation();

  const handleEdit = (id: string) => {
    router.push(`${STORE_ROUTES.account.addresses}/${id}/edit`);
  };

  const handleDelete = (id: string) => {
    deleteMutation.mutate(id);
  };

  const handleSetDefault = (id: string) => {
    setDefaultMutation.mutate(id);
  };

  return (
    <PageContainer className="max-w-5xl">
      <PageHeader
        title="Sổ địa chỉ"
        subtitle="Quản lý địa chỉ nhận hàng và thanh toán của bạn."
        actions={
          <Button onClick={() => router.push(`${STORE_ROUTES.account.addresses}/new`)} className="rounded-full">
            <Plus className="mr-2 size-4" />
            Thêm địa chỉ mới
          </Button>
        }
      />

      {isLoading ? (
        <div className="flex justify-center p-8 text-ink-secondary">Đang tải...</div>
      ) : error ? (
        <div className="flex justify-center p-8 text-danger">Lỗi: {(error as Error).message}</div>
      ) : addresses?.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            title="Sổ địa chỉ của bạn đang trống"
            description="Hãy thêm địa chỉ để thanh toán nhanh hơn trong những lần mua hàng tới."
            action={
              <Button onClick={() => router.push(`${STORE_ROUTES.account.addresses}/new`)} className="rounded-full">
                Thêm địa chỉ đầu tiên
              </Button>
            }
          />
        </div>
      ) : (
        <div className="mt-8">
          <AddressBook
            addresses={addresses ?? []}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onSetDefault={handleSetDefault}
          />
        </div>
      )}
    </PageContainer>
  );
}
