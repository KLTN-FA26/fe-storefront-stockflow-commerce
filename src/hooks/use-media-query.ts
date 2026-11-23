"use client";

import { useSyncExternalStore } from "react";

/**
 * Whether a media query matches, read through `useSyncExternalStore`: false on the server and in an
 * environment without `matchMedia` (jsdom), so the first paint is the mobile layout and nothing
 * throws. For layout choices CSS alone cannot make, such as moving a card in the DOM.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
        return () => {};
      }
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () =>
      typeof window !== "undefined" && typeof window.matchMedia === "function"
        ? window.matchMedia(query).matches
        : false,
    () => false,
  );
}
