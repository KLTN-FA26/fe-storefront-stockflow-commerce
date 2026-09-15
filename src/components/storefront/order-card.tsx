import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface OrderCardProps {
  href: string;
  orderCode: string;
  status: string;
  itemCount: number;
  total: number;
  createdAt: string;
}

export function OrderCard({ href, orderCode, status, itemCount, total, createdAt }: OrderCardProps) {
  const formatter = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" });
  return (
    <article className="rounded-xl bg-bg-surface p-[var(--card-pad)] shadow-md">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-sm font-semibold text-accent">{orderCode}</p>
          <p className="text-sm text-ink-secondary">{itemCount} sản phẩm · {createdAt}</p>
        </div>
        <Badge variant="secondary" className="rounded-full">{status}</Badge>
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="font-display text-xl font-bold tabular-nums">{formatter.format(total)}</span>
        <Button asChild variant="secondary" className="rounded-full"><Link href={href}>Chi tiết</Link></Button>
      </div>
    </article>
  );
}
