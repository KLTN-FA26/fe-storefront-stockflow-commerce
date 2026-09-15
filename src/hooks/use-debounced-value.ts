/**
 * Debounced value hook.
 *
 * Returns the value after `delay` ms of inactivity.
 * Used for search input debouncing.
 */

"use client";

import { useState, useEffect } from "react";

export function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
