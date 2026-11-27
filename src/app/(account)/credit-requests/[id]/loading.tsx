import { Skeleton } from "@/components/shared";

export default function CreditRequestLoading() {
  return (
    <Skeleton role="status" aria-label="Đang tải" className="h-64 w-full rounded-[var(--r-lg)]" />
  );
}
