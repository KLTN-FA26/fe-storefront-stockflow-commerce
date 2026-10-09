import { PageContainer } from "@/components/shared";
import { AddressBookScreen } from "@/features/customer/address/components/address-book-screen";

export default function AddressesPage() {
  return (
    <PageContainer className="max-w-5xl">
      <AddressBookScreen />
    </PageContainer>
  );
}
