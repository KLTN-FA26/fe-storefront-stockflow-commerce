import { EInvoiceLinkScreen } from "@/features/order";

/** BE notification link of an issued invoice: opens its order's invoices card (WF-05 SF-06). */
export default async function EInvoiceLinkPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EInvoiceLinkScreen id={id} />;
}
