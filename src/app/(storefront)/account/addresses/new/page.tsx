import { PageContainer } from "@/components/shared";
import { AddressEditor } from "@/features/customer/address/components/address-editor";

export default function NewAddressPage() {
  return (
    <PageContainer className="max-w-3xl">
      <AddressEditor />
    </PageContainer>
  );
}
