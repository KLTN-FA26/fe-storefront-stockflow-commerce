"use client";

import Link from "next/link";
import { Plus } from "lucide-react";

import { STORE_ROUTES } from "@/constants";
import { EmptyState, PageHeader } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

import { useDeleteAddress, useSetDefaultAddress } from "../mutations";
import { useAddressBook } from "../queries";
import { AddressBook } from "./address-book";
import { AddressListSkeleton, AddressLoadError, AddressStaleNotice } from "./address-book-states";

const NEW_ADDRESS_HREF = `${STORE_ROUTES.account.addresses}/new`;

export function AddressBookScreen() {
  const router = useRouter();
  const { customerId, addresses, isLoading, isFetching, error, refetch } = useAddressBook();
  const deleteMutation = useDeleteAddress();
  const setDefaultMutation = useSetDefaultAddress();
  const busy = deleteMutation.isPending || setDefaultMutation.isPending;
  const hasAddresses = !!addresses && addresses.length > 0;

  return (
    <>
      <PageHeader
        title="Sổ địa chỉ"
        subtitle="Quản lý địa chỉ giao hàng và thanh toán của bạn."
        actions={
          hasAddresses ? (
            <Button asChild className="h-11 rounded-full">
              <Link href={NEW_ADDRESS_HREF}>
                <Plus aria-hidden className="mr-2 size-4" />
                Thêm địa chỉ mới
              </Link>
            </Button>
          ) : undefined
        }
      />

      <div className="mt-8 space-y-6">
        {error && addresses && (
          <AddressStaleNotice error={error} onRetry={() => void refetch()} retrying={isFetching} />
        )}
        {isLoading ? (
          <AddressListSkeleton />
        ) : error && !addresses ? (
          <AddressLoadError error={error} onRetry={() => void refetch()} retrying={isFetching} />
        ) : !hasAddresses ? (
          <EmptyState
            title="Sổ địa chỉ của bạn đang trống"
            description="Thêm địa chỉ để thanh toán nhanh hơn trong những lần mua hàng tới."
            action={
              <Button asChild className="h-11 rounded-full">
                <Link href={NEW_ADDRESS_HREF}>Thêm địa chỉ đầu tiên</Link>
              </Button>
            }
          />
        ) : (
          customerId && (
            <AddressBook
              addresses={addresses}
              busy={busy}
              onEdit={(addressId) =>
                router.push(`${STORE_ROUTES.account.addresses}/${addressId}/edit`)
              }
              onDelete={(addressId) => deleteMutation.mutate({ customerId, addressId })}
              onSetDefault={(addressId) => setDefaultMutation.mutate({ customerId, addressId })}
            />
          )
        )}
      </div>
    </>
  );
}
