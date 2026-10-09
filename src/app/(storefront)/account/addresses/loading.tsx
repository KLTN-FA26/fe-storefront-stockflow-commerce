import { PageContainer, Skeleton } from "@/components/shared";

export default function AddressesLoading() {
  return (
    <PageContainer className="max-w-5xl">
      <div role="status" aria-label="Đang tải sổ địa chỉ" className="space-y-4">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-36 w-full rounded-[var(--r-xl)]" />
        <Skeleton className="h-36 w-full rounded-[var(--r-xl)]" />
      </div>
    </PageContainer>
  );
}
