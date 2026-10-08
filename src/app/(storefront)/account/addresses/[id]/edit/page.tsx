import { PageContainer } from "@/components/shared";
import { AddressEditor } from "@/features/customer/address/components/address-editor";

export default async function EditAddressPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <PageContainer className="max-w-3xl">
      <AddressEditor addressId={id} />
    </PageContainer>
  );
}
