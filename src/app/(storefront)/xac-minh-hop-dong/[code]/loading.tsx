import { Skeleton } from "@/components/shared";

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <Skeleton
        role="status"
        aria-label="Đang tải trang xác minh"
        className="h-64 w-full rounded-[var(--r-lg)]"
      />
    </div>
  );
}
