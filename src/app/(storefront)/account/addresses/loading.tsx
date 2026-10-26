import { Skeleton } from "@/components/shared";

export default function AddressesLoading() {
  return (
    <div className="max-w-5xl">
      <div role="status" aria-label="Đang tải sổ địa chỉ" className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <div className="space-y-3">
          <Skeleton className="h-5 w-40" />
          <div className="grid gap-4 md:grid-cols-2">
            <Skeleton className="h-44 w-full rounded-[var(--r-lg)]" />
            <Skeleton className="h-44 w-full rounded-[var(--r-lg)]" />
          </div>
        </div>
      </div>
    </div>
  );
}
