import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useThreadScroll } from "../components/use-thread-scroll";

// jsdom has no layout and no observers that fire: capture the callbacks and give the log a height of its own.
const observers: Array<() => void> = [];
beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: () => void) {
        observers.push(callback);
      }
      observe() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  observers.length = 0;
  vi.unstubAllGlobals();
});

function Log({ seq }: { seq: number }) {
  const { scroller, onScroll } = useThreadScroll({ seq, mine: false });
  return <div ref={scroller} onScroll={onScroll} data-testid="log" />;
}

describe("useThreadScroll keeps the end in view while the customer is there (S04-5)", () => {
  it("follows the end when the log resizes (a card fills in, a banner grows the footer)", () => {
    const { getByTestId } = render(<Log seq={1} />);
    const log = getByTestId("log");
    Object.defineProperty(log, "scrollHeight", { configurable: true, value: 900 });

    act(() => observers.forEach((follow) => follow()));

    expect(log.scrollTop).toBe(900);
  });

  it("leaves a customer who scrolled up reading an older card where they are", () => {
    const { getByTestId } = render(<Log seq={1} />);
    const log = getByTestId("log");
    Object.defineProperty(log, "scrollHeight", { configurable: true, value: 900 });
    Object.defineProperty(log, "clientHeight", { configurable: true, value: 400 });
    log.scrollTop = 100;
    act(() => {
      log.dispatchEvent(new Event("scroll"));
    });

    act(() => observers.forEach((follow) => follow()));

    expect(log.scrollTop).toBe(100);
  });
});
