"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Within this many pixels of the end the customer counts as reading the newest messages. */
export const NEAR_BOTTOM_PX = 96;

interface Newest {
  seq: number;
  /** The customer's own message: they just sent it, take them to it. */
  mine: boolean;
}

/**
 * Keeps the thread at its newest message only while the customer is there (SF-UX-23). Someone reading an older card
 * stays where they are; what arrives meanwhile is counted for a "Tin nhắn mới ↓" pill instead. The first load and the
 * customer's own message always go to the end.
 */
export function useThreadScroll(newest: Newest | null) {
  const scroller = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const shownSeq = useRef(0);
  const [unseen, setUnseen] = useState(0);

  const toBottom = useCallback(() => {
    const element = scroller.current;
    if (element) element.scrollTop = element.scrollHeight;
    atBottom.current = true;
    setUnseen(0);
  }, []);

  const onScroll = useCallback(() => {
    const element = scroller.current;
    if (!element) return;
    atBottom.current =
      element.scrollHeight - element.scrollTop - element.clientHeight <= NEAR_BOTTOM_PX;
    if (atBottom.current) setUnseen(0);
  }, []);

  const seq = newest?.seq ?? 0;
  const mine = newest?.mine ?? false;
  useEffect(() => {
    if (seq <= shownSeq.current) return;
    const first = shownSeq.current === 0;
    shownSeq.current = seq;
    if (first || mine || atBottom.current) toBottom();
    else setUnseen((count) => count + 1);
  }, [seq, mine, toBottom]);

  return { scroller, onScroll, unseen, toBottom };
}
