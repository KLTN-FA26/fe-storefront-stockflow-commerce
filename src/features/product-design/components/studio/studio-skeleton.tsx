import { Skeleton } from "@/components/shared";

import { CARD_BOX } from "./card-box";

/**
 * The studio's body while it loads, shaped like layout A: the context-bar strip, then the rail
 * (72 px), the stage and, in the stage's bottom-right corner, the 300 × 320 preview card.
 */
export function StudioBodySkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div data-testid="skeleton-context-bar" className="border-border-default flex h-11 border-b">
        <Skeleton className="h-full w-full rounded-none" />
      </div>
      <div className="flex min-h-0 flex-1 gap-3 p-3">
        <div data-testid="skeleton-rail" className="hidden w-18 shrink-0 lg:flex">
          <Skeleton className="w-full rounded-[var(--r-lg)]" />
        </div>
        <div data-testid="skeleton-stage" className="relative min-h-80 min-w-0 flex-1">
          <Skeleton className="absolute inset-0 rounded-[var(--r-lg)]" />
          <div data-testid="skeleton-card" className={`${CARD_BOX} hidden lg:block`}>
            <Skeleton className="size-full rounded-[var(--r-lg)]" />
          </div>
        </div>
      </div>
    </div>
  );
}

/** The studio's loading shape: a header bar, then the body skeleton. */
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
