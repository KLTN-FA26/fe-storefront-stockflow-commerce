import { Skeleton } from "@/components/shared";

export default function PaymentsLoading() {
  return (
    <div role="status" aria-label="Đang tải các đợt thanh toán" className="space-y-3">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-40 w-full rounded-[var(--r-lg)]" />
    </div>
  );
}
