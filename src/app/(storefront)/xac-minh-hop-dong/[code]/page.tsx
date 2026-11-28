import type { Metadata } from "next";
import { ContractVerificationScreen } from "@/features/order/components/contract-verification-screen";

export const metadata: Metadata = {
  title: "Xác minh hợp đồng",
  robots: { index: false, follow: false },
};

export default async function ContractVerificationPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  return <ContractVerificationScreen code={code} />;
}
