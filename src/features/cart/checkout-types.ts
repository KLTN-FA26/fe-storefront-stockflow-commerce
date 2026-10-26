/** A saved SHIPPING address as the checkout needs it (the page maps it from the address book). */
export interface ShippingAddressOption {
  addressId: string;
  recipientName: string;
  phone: string;
  /** Single-line address: line1, line2, ward, province. */
  summary: string;
  isDefault: boolean;
}

/** What the page hands the checkout: the signed-in customer and their saved shipping addresses. */
export interface CheckoutCustomer {
  /** UUID of the customer profile (GET /customers/me); the BE rejects any other customer id. */
  customerId: string | undefined;
  addresses: ShippingAddressOption[] | undefined;
  isLoading: boolean;
  error: unknown;
  onRetry: () => void;
}
