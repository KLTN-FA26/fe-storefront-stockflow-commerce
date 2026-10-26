import { AddressEditor } from "@/features/customer/address/components/address-editor";

export default async function EditAddressPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="max-w-5xl">
      <AddressEditor addressId={id} />
    </div>
  );
}
