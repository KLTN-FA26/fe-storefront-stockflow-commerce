"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { STORE_ROUTES } from "@/constants";
import { Alert, EmptyState, PageHeader } from "@/components/shared";
import { Button } from "@/components/ui/button";
import type { ApiError } from "@/lib/api/error";

import { useCreateAddress, useUpdateAddress } from "../mutations";
import { useAddressBook } from "../queries";
import { toSaveAddressRequest } from "../selectors";
import type { AddressFormValues } from "../types";
import { AddressForm } from "./address-form";
import { AddressFormSkeleton, AddressLoadError } from "./address-book-states";

/** Create (no `addressId`) or edit an address of the signed-in customer. */
export function AddressEditor({ addressId }: { addressId?: string }) {
  const router = useRouter();
  const { customerId, addresses, isLoading, isFetching, error, refetch } = useAddressBook();
  const createMutation = useCreateAddress();
  const updateMutation = useUpdateAddress();
  const mutation = addressId ? updateMutation : createMutation;
  // Bumped after an OPTIMISTIC_LOCK reload to remount the form on the latest snapshot.
  const [formKey, setFormKey] = useState(0);
  const [conflict, setConflict] = useState(false);

  const snapshot = addressId ? addresses?.find((a) => a.addressId === addressId) : undefined;
  const backToList = () => router.push(STORE_ROUTES.account.addresses);

  const reloadAfterConflict = async () => {
    setConflict(true);
    await refetch();
    setFormKey((key) => key + 1);
  };

  const submit = (values: AddressFormValues, version: number | null) => {
    if (!customerId) return;
    setConflict(false);
    const options = {
      onSuccess: backToList,
      onError: (err: ApiError) => {
        if (err.code === "OPTIMISTIC_LOCK") void reloadAfterConflict();
      },
    };
    const body = toSaveAddressRequest(values, version);
    if (addressId) updateMutation.mutate({ customerId, addressId, body }, options);
    else createMutation.mutate({ customerId, body }, options);
  };

  const serverError =
    mutation.error && mutation.error.code !== "OPTIMISTIC_LOCK" ? mutation.error : null;

  return (
    <>
      <div className="mb-6 flex items-center gap-2">
        <Button
          variant="ghost"
          className="size-11 rounded-full"
          aria-label="Quay lại sổ địa chỉ"
          onClick={backToList}
        >
          <ArrowLeft aria-hidden className="size-5" />
        </Button>
        <PageHeader title={addressId ? "Sửa địa chỉ" : "Thêm địa chỉ mới"} />
      </div>

      {isLoading ? (
        <AddressFormSkeleton />
      ) : error && !addresses ? (
        <AddressLoadError error={error} onRetry={() => void refetch()} retrying={isFetching} />
      ) : addressId && !snapshot ? (
        <EmptyState
          title="Không tìm thấy địa chỉ"
          description="Địa chỉ này không còn trong sổ địa chỉ của bạn, có thể đã bị xoá."
          action={
            <Button asChild className="h-11 rounded-[var(--r-md)]">
              <Link href={STORE_ROUTES.account.addresses}>Về sổ địa chỉ</Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          {conflict && (
            <Alert tone="warning" title="Địa chỉ đã thay đổi">
              {isFetching
                ? "Địa chỉ vừa được cập nhật ở nơi khác, đang tải lại bản mới nhất..."
                : "Đã tải lại bản mới nhất, các thay đổi chưa lưu của bạn đã được thay bằng bản này. Vui lòng kiểm tra rồi lưu lại."}
            </Alert>
          )}
          <AddressForm
            key={formKey}
            snapshot={snapshot}
            onSubmit={submit}
            isSubmitting={mutation.isPending}
            serverError={serverError}
          />
        </div>
      )}
    </>
  );
}
