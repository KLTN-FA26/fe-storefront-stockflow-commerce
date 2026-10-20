import { create } from "zustand";

/** What /search is showing (its q and sort); undefined on every other page. */
export interface CurrentSearch {
  q?: string | undefined;
  sort?: string | undefined;
}

/**
 * The search page tells the header search box what it shows, so the box can show the text and
 * keep the sort. The header lives in the layout: reading the URL there would need
 * useSearchParams under Suspense, which kept the desktop box on its empty fallback on /search.
 */
export const useCurrentSearch = create<{ current: CurrentSearch | undefined }>(() => ({
  current: undefined,
}));
