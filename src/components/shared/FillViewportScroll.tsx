"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { cn } from "@/lib/cn";

interface FillViewportScrollProps {
  /** Names the scroll area for assistive technology while it scrolls. */
  label: string;
  children: ReactNode;
  className?: string;
}

/**
 * A list box that takes the height left in the window below where it starts, minus what follows it in its column (the
 * pagination) and the column's bottom padding, and scrolls inside that, so the page itself stays one screen high, as a
 * back-office table does. From `lg` up only; below it the list runs at full length in the page.
 */
export function FillViewportScroll({ label, children, className }: FillViewportScrollProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [maxHeight, setMaxHeight] = useState<number | undefined>(undefined);

  useEffect(() => {
    const box = ref.current;
    // No matchMedia (jsdom in tests): no window to fill, the list runs at full length.
    if (!box || typeof window.matchMedia !== "function") return;
    const desktop = window.matchMedia("(min-width: 1024px)");

    const measure = () => {
      if (!desktop.matches) {
        setMaxHeight(undefined);
        return;
      }
      // What comes after the box in the page column: the pagination below it, then the column's own padding.
      let below = 0;
      for (let next = box.nextElementSibling; next; next = next.nextElementSibling) {
        below +=
          next.getBoundingClientRect().height + parseFloat(getComputedStyle(next).marginTop || "0");
      }
      const column = box.closest<HTMLElement>("[data-account-column]");
      const padding = column ? parseFloat(getComputedStyle(column).paddingBottom || "0") : 0;
      const top = box.getBoundingClientRect().top + (column?.scrollTop ?? 0);
      const room = Math.floor(window.innerHeight - top - below - padding);
      setMaxHeight(room > 160 ? room : undefined);
    };

    measure();
    window.addEventListener("resize", measure);
    desktop.addEventListener("change", measure);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(box.parentElement ?? box);
    return () => {
      window.removeEventListener("resize", measure);
      desktop.removeEventListener("change", measure);
      observer?.disconnect();
    };
  }, []);

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
