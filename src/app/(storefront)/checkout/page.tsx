"use client";

import { CheckoutScreen, type CheckoutCustomer } from "@/features/cart";
import { useAddressBook } from "@/features/customer/address";
import { formatAddressLine } from "@/features/customer/address/selectors";
import { useSignedIn } from "@/lib/auth/use-signed-in";

import { PageShell } from "@/components/storefront/layout";

const NO_CUSTOMER: CheckoutCustomer = {
  customerId: undefined,
  addresses: undefined,
  isLoading: false,
  error: undefined,
  onRetry: () => undefined,
};

/**
 * The address book lives in features/customer; features do not import each other, so this page
 * (app layer) joins them and hands the checkout plain props. It is only mounted for a signed-in
 * customer: without a token the book's first call would answer 401 and bounce to /login.
 */
function CheckoutWithAddressBook() {
  const book = useAddressBook();
  const customer: CheckoutCustomer = {
    customerId: book.customerId,
    isLoading: book.isLoading,
    error: book.error,
    onRetry: () => void book.refetch(),
    addresses: book.addresses
      ?.filter((address) => address.type === "SHIPPING")
      .map((address) => ({
        addressId: address.addressId,
        recipientName: address.recipientName,
        phone: address.phone,
        summary: formatAddressLine(address),
        isDefault: address.defaultAddress,
      })),
  };
  return <CheckoutScreen customer={customer} />;
}

export default function CheckoutPage() {
  const signedIn = useSignedIn();
  return (
    <PageShell
      title="Đặt hàng"
      subtitle="Chọn địa chỉ giao hàng và kiểm tra lại đơn trước khi đặt."
    >
      {signedIn ? <CheckoutWithAddressBook /> : <CheckoutScreen customer={NO_CUSTOMER} />}
    </PageShell>
  );
}
