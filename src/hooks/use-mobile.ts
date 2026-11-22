"use client";

import { useMediaQuery } from "./use-media-query";

const MOBILE_BREAKPOINT = 768;

/**
 * Below the `md` breakpoint (768px). False on the server and on the first paint, like every media
 * query here: one implementation, `useMediaQuery`.
 */
export function useIsMobile(): boolean {
  return useMediaQuery(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
}
