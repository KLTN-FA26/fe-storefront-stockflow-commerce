import { AddressEditor } from "@/features/customer/address/components/address-editor";

export default async function EditAddressPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div>
      <AddressEditor addressId={id} />
    </div>
  );
}
