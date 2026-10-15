import Link from "next/link";
import { CheckCircle2, XCircle } from "lucide-react";

import { STORE_ROUTES } from "@/constants";
import { Button } from "@/components/ui/button";
import { PageShell, SurfaceCard } from "@/components/storefront/layout";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function PaymentResultPage({ params }: PageProps) {
  const { id } = await params;
  const success = !id.includes("fail");
  const Icon = success ? CheckCircle2 : XCircle;

  return (
    <PageShell width="narrow">
      <div className="flex min-h-[60vh] items-center justify-center">
        <SurfaceCard className="w-full max-w-xl py-8 text-center sm:py-10">
          <Icon className={`mx-auto h-12 w-12 ${success ? "text-positive" : "text-danger"}`} />
          <h1 className="font-display text-ink-primary mt-4 text-2xl font-bold sm:text-3xl">
            {success ? "Thanh toán thành công" : "Thanh toán thất bại"}
          </h1>
          <p className="text-ink-secondary mt-2 text-sm break-words sm:text-base">
            Giao dịch <span className="font-mono tabular-nums">{id}</span> · Không lưu thông tin
            thẻ, chỉ hiển thị brand và last4 khi cần.
          </p>
          <Button asChild className="mt-6 min-h-11 rounded-[var(--r-md)]">
            <Link href={STORE_ROUTES.account.orders.list}>Xem đơn hàng</Link>
          </Button>
        </SurfaceCard>
      </div>
    </PageShell>
  );
}
