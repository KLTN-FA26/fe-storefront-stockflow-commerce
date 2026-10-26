import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";

/** What /search is showing: its text and a sort the BE accepts. */
export interface CurrentSearch {
  q?: string | undefined;
  sort?: string | undefined;
}

/**
 * The URL stays the only source of the search state (nuqs on /search). This is a read-only
 * projection of it for the header search box: the header lives in the layout, and reading the
 * URL there needs useSearchParams under Suspense, which kept the desktop box on its empty
 * fallback on /search. The search page is the only writer (publishCurrentSearch).
 */
const store = createStore<{ current: CurrentSearch | undefined }>(() => ({ current: undefined }));

/** Called by CatalogScreen on /search with what it shows, and with undefined when it is left. */
export function publishCurrentSearch(current: CurrentSearch | undefined) {
  store.setState({ current });
}

/** What /search shows, or undefined on every other page. */
export function useCurrentSearch(): CurrentSearch | undefined {
  return useStore(store, (state) => state.current);
}
