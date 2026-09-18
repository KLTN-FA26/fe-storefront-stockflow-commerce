export interface Address {
  id: string;
  recipientName: string;
  recipientPhone: string;
  line1: string;
  ward: string;
  city?: string | undefined;
  province: string;
  country: string;
  postalCode?: string | undefined;
  isDefault: boolean;
}
