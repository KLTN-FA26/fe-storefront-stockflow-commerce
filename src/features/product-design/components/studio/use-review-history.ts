"use client";

import { useDesignHistory } from "../../queries";

/**
 * Whether the design has a review history to show: a step beyond its creation (submitted,
 * returned, approved). False while it loads and when the history cannot be read, so the studio
 * simply has no "Lịch sử" item then. Shares the `DecisionHistory` query.
 */
export function useHasReviewHistory(designId: string): boolean {
  const { data } = useDesignHistory(designId);
  return data?.some((event) => event.type !== "CREATED") ?? false;
}
