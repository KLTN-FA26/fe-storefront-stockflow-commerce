"use client";

import { createContext, useCallback, useContext, useLayoutEffect, useRef, useState } from "react";

/** The bar's gap between controls (`gap-2`), which the plan counts for every group. */
const BAR_GAP = 8;
/** What the "Thêm" button takes when the plan has to add it (36 px and the gap). */
const MORE_WIDTH = 36;
/** Room a hidden group needs beyond its width before it comes back. */
const RESTORE_SLACK = 4;

type OverflowGroup = {
  id: string;
  /** Higher goes into "Thêm" first. */
  rank: number;
  /** Measured while it was inline; kept so it can come back once there is room. */
  width: number;
  hidden: boolean;
};

/**
 * Which groups sit in "Thêm": the lowest-priority inline groups go until the row (`needed`) fits
 * `available`; when nothing had to go, the highest-priority hidden groups come back while they
 * still fit. `morePresent`: the "Thêm" button is in the row already (otherwise the first group
 * moved adds it).
 */
function planOverflow({
  available,
  needed,
  morePresent,
  groups,
}: {
  available: number;
  needed: number;
  morePresent: boolean;
  groups: readonly OverflowGroup[];
}): Set<string> {
  const hidden = new Set(groups.filter((g) => g.hidden).map((g) => g.id));
  const dropOrder = [...groups].sort((a, b) => b.rank - a.rank);
  let width = needed;
  let more = morePresent;
  let dropped = false;
  while (width > available) {
    const next = dropOrder.find((g) => !hidden.has(g.id));
    if (!next) break;
    hidden.add(next.id);
    dropped = true;
    width -= next.width + BAR_GAP;
    if (!more) {
      width += MORE_WIDTH + BAR_GAP;
      more = true;
    }
  }
  if (!dropped) {
    for (const group of dropOrder.filter((g) => hidden.has(g.id)).reverse()) {
      // A little slack, so a width on the boundary (offsetWidth is rounded) cannot flip it.
      if (width + group.width + BAR_GAP + RESTORE_SLACK > available) break;
      hidden.delete(group.id);
      width += group.width + BAR_GAP;
    }
  }
  return hidden;
}

type BarOverflowContextValue = {
  readOnly: boolean;
  hidden: ReadonlySet<string>;
  /** The content of the "Thêm" popover while it is open; hidden groups are drawn into it. */
  more: HTMLElement | null;
  /** A group is mounted (`width` set while it is inline) or gone (`null`). */
  report(id: string, rank: number, width: number | undefined): void;
  forget(id: string): void;
  /** Something always lives in "Thêm" (a text's outline fields): the button is there. */
  claimMore(): () => void;
};

const NONE: ReadonlySet<string> = new Set();

/** Outside a `ContextBar` every group is inline. */
export const BarOverflowContext = createContext<BarOverflowContextValue>({
  readOnly: false,
  hidden: NONE,
  more: null,
  report: () => undefined,
  forget: () => undefined,
  claimMore: () => () => undefined,
});

export const useBarOverflowContext = () => useContext(BarOverflowContext);

const sameSet = (a: ReadonlySet<string>, b: ReadonlySet<string>) =>
  a.size === b.size && [...a].every((id) => b.has(id));

const px = (value: string) => Number.parseFloat(value) || 0;

/**
 * Priority overflow of the context bar. `section` is the bar, `row` its content (as wide as its
 * controls), `end` the right-end slot. After every render and whenever the bar or the row is
 * resized, the groups that do not fit move into "Thêm" (lowest priority first) and return when
 * there is room again; each group's width is cached by id while it is inline, so the plan knows
 * what a hidden group would take.
 */
export function useBarOverflow(readOnly: boolean) {
  // Callback refs into state: the bar's nodes come and go (nothing selected has no row), and the
  // observer follows them.
  const [section, setSection] = useState<HTMLElement | null>(null);
  const [row, setRow] = useState<HTMLFieldSetElement | null>(null);
  const [end, setEnd] = useState<HTMLDivElement | null>(null);
  const groups = useRef(new Map<string, { rank: number; width: number }>());
  const claims = useRef(0);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(NONE);
  const [more, setMore] = useState<HTMLElement | null>(null);
  const [claimed, setClaimed] = useState(0);
  const [, rerun] = useState(0);

  const report = useCallback((id: string, rank: number, width: number | undefined) => {
    const known = groups.current.get(id);
    groups.current.set(id, { rank, width: width ?? known?.width ?? 0 });
  }, []);
  const forget = useCallback((id: string) => void groups.current.delete(id), []);
  const claimMore = useCallback(() => {
    claims.current += 1;
    setClaimed(claims.current);
    return () => {
      claims.current -= 1;
      setClaimed(claims.current);
    };
  }, []);

  const fit = useCallback(() => {
    const bar = section;
    const content = row;
    if (!bar || !content) return;
    if (bar.clientWidth === 0) return; // not laid out (hidden, or no layout engine)
    const style = getComputedStyle(bar);
    const endWidth = end ? end.offsetWidth + BAR_GAP : 0;
    const available = bar.clientWidth - px(style.paddingLeft) - px(style.paddingRight) - endWidth;
    const next = planOverflow({
      available,
      needed: content.offsetWidth,
      morePresent: claims.current > 0 || hidden.size > 0,
      groups: [...groups.current].map(([id, g]) => ({ id, ...g, hidden: hidden.has(id) })),
    });
    if (!sameSet(next, hidden)) setHidden(next);
  }, [hidden, section, row, end]);

  // After every render (the children have reported by now), and again when sizes change.
  useLayoutEffect(fit);
  useLayoutEffect(() => {
    if (!section || !row || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => rerun((n) => n + 1));
    for (const node of [section, row, end]) if (node) observer.observe(node);
    return () => observer.disconnect();
  }, [section, row, end]);

  const value: BarOverflowContextValue = { readOnly, hidden, more, report, forget, claimMore };
  return {
    section: setSection,
    row: setRow,
    end: setEnd,
    value,
    showMore: claimed > 0 || hidden.size > 0,
    setMore,
  };
}
