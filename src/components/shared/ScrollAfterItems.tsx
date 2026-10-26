"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { cn } from "@/lib/cn";

interface ScrollAfterItemsProps {
  /** How many list items stay visible before the list scrolls inside itself. */
  visibleItems: number;
  /** Accessible name for the scroll region once it scrolls. */
  label: string;
  /** A single list element (e.g. `<ul>`) whose direct children are the items. */
  children: ReactNode;
  className?: string | undefined;
}

/** Caps a list at `visibleItems` rows and scrolls the rest inside the box. */
export function ScrollAfterItems({
  visibleItems,
  label,
  children,
  className,
}: ScrollAfterItemsProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [maxHeight, setMaxHeight] = useState<number | undefined>(undefined);

  useEffect(() => {
    const box = ref.current;
    const list = box?.firstElementChild;
    if (!box || !list) return;

    const measure = () => {
      const items = list.children;
      const last = items[visibleItems - 1];
      if (items.length <= visibleItems || !last) {
        setMaxHeight(undefined);
        return;
      }
      const height =
        last.getBoundingClientRect().bottom - box.getBoundingClientRect().top + box.scrollTop;
      // Room for the last card's shadow/focus ring (matches the p-1 padding below).
      setMaxHeight(height > 0 ? Math.ceil(height) + 4 : undefined);
    };

    measure();
    // Environments without ResizeObserver (e.g. jsdom) keep the first measurement.
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    return () => observer.disconnect();
  }, [visibleItems]);

  const scrolls = maxHeight !== undefined;

  return (
    <div
      ref={ref}
      className={cn(
        "-m-1 p-1",
        scrolls &&
          "focus-visible:ring-accent overflow-y-auto overscroll-contain rounded-[var(--r-lg)] focus-visible:ring-2 focus-visible:outline-none",
        className,
      )}
      style={scrolls ? { maxHeight } : undefined}
      {...(scrolls ? { role: "region", "aria-label": label, tabIndex: 0 } : {})}
    >
      {children}
    </div>
  );
}
