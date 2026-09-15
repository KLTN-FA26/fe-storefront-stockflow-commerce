import { CheckCircle2, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";

interface PageProps { params: Promise<{ id: string }> }

export default async function PaymentResultPage({ params }: PageProps) {
  const { id } = await params;
  const success = !id.includes("fail");
  const Icon = success ? CheckCircle2 : XCircle;

  return (
    <section className="mx-auto flex min-h-[60vh] max-w-xl items-center px-4 py-8">
      <div className="w-full rounded-xl bg-bg-surface p-[var(--card-pad)] text-center shadow-md">
        <Icon className={`mx-auto h-12 w-12 ${success ? "text-positive" : "text-danger"}`} />
        <h1 className="mt-4 font-display text-3xl font-bold">{success ? "Thanh toán thành công" : "Thanh toán thất bại"}</h1>
        <p className="mt-2 text-ink-secondary">Giao dịch {id} · Không lưu thông tin thẻ, chỉ hiển thị brand và last4 khi cần.</p>
        <Button className="mt-6 rounded-full">Xem đơn hàng</Button>
      </div>
    </section>
  );
}
