import { Skeleton } from "@/components/shared";

/** The studio's body while it loads: the tool rail, tool panel, stage and preview columns. */
export function StudioBodySkeleton() {
  return (
    <div className="grid flex-1 gap-3 p-3 lg:grid-cols-[3.5rem_17.5rem_minmax(0,1fr)_minmax(22rem,38%)]">
      <Skeleton className="hidden rounded-[var(--r-lg)] lg:block" />
      <Skeleton className="hidden rounded-[var(--r-lg)] lg:block" />
      <Skeleton className="min-h-80 rounded-[var(--r-lg)]" />
      <Skeleton className="min-h-80 rounded-[var(--r-lg)]" />
    </div>
  );
}

/** The studio's loading shape: a header bar, then the tool rail, panel, stage and side panel. */
export function StudioSkeleton() {
  return (
    <div role="status" aria-label="Đang tải trình thiết kế" className="flex flex-1 flex-col">
      <div className="bg-bg-surface border-border-default flex h-14 items-center gap-3 border-b px-4">
        <Skeleton className="size-9 rounded-[var(--r-md)]" />
        <Skeleton className="h-5 w-40" />
        <Skeleton className="ml-auto h-8 w-24 rounded-full" />
      </div>
      <StudioBodySkeleton />
    </div>
  );
}
