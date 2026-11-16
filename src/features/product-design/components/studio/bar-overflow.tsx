"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/cn";

import { useBarOverflowContext } from "./use-bar-overflow";

const GROUP = "m-0 min-w-0 border-0 p-0";

/**
 * A group of controls that can move into "Thêm" when the bar is too narrow. `rank`: the higher it
 * is, the sooner it moves. Inline it is a fieldset (`disabled` here, or the read-only design,
 * disables it); in "Thêm" the same controls (or `more`, a roomier form of them) are drawn into the
 * popover, which is outside the bar's own fieldsets, so they are disabled the same way.
 */
export function BarGroup({
  id,
  rank,
  disabled = false,
  children,
  more,
}: {
  id: string;
  rank: number;
  disabled?: boolean;
  children: ReactNode;
  more?: ReactNode;
}) {
  const bar = useBarOverflowContext();
  const element = useRef<HTMLFieldSetElement>(null);
  const hidden = bar.hidden.has(id);
  const off = bar.readOnly || disabled;
  const { report, forget } = bar;

  useLayoutEffect(() => {
    report(id, rank, hidden ? undefined : element.current?.offsetWidth);
  });
  useLayoutEffect(() => () => forget(id), [id, forget]);

  if (!hidden) {
    return (
      <fieldset
        ref={element}
        data-bar-group={id}
        disabled={off}
        className={cn(GROUP, "flex shrink-0 items-center gap-2")}
      >
        {children}
      </fieldset>
    );
  }
  return bar.more
    ? createPortal(
        <fieldset disabled={off} className={cn(GROUP, "flex flex-wrap items-center gap-2")}>
          {more ?? children}
        </fieldset>,
        bar.more,
      )
    : null;
}

/** What always lives in "Thêm" (a text's outline, spacing and line height); it opens the button. */
export function BarMore({
  disabled = false,
  children,
}: {
  disabled?: boolean;
  children: ReactNode;
}) {
  const bar = useBarOverflowContext();
  const { claimMore } = bar;
  useLayoutEffect(() => claimMore(), [claimMore]);
  return bar.more
    ? createPortal(
        <fieldset
          disabled={bar.readOnly || disabled}
          className={cn(GROUP, "flex flex-col gap-2.5")}
        >
          {children}
        </fieldset>,
        bar.more,
      )
    : null;
}
