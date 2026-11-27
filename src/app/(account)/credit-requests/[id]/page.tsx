import { CreditRequestDetail } from "@/features/customer/credit-request";

/** The link of the "đề nghị đã có kết quả" notification (BE PR #490): `/credit-requests/{id}`. */
export default async function CreditRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CreditRequestDetail id={id} />;
}
