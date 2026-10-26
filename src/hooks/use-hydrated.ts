"use client";

import { useSyncExternalStore } from "react";

const subscribeNever = () => () => undefined;

/**
 * `false` on the server and during hydration, `true` afterwards. State that lives only in the
 * browser (localStorage: session, cart) must not render before this, or the first client render
 * would differ from the server HTML.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );
}
