import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useMediaQuery } from "./use-media-query";
import { useIsMobile } from "./use-mobile";

/** A `matchMedia` whose answer the test flips, telling the hook's listeners. */
function stubMatchMedia(initial: boolean) {
  let matches = initial;
  const listeners = new Set<() => void>();
  const queries: string[] = [];
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => {
      queries.push(query);
      return {
        get matches() {
          return matches;
        },
        addEventListener: (_: string, listener: () => void) => listeners.add(listener),
        removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
      };
    }),
  );
  return {
    queries,
    set: (next: boolean) =>
      act(() => {
        matches = next;
        listeners.forEach((listener) => listener());
      }),
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("useMediaQuery / useIsMobile", () => {
  it("is false where there is no matchMedia (jsdom, the server)", () => {
    expect(renderHook(() => useMediaQuery("(min-width: 64rem)")).result.current).toBe(false);
    expect(renderHook(() => useIsMobile()).result.current).toBe(false);
  });

  it("follows the query as it changes", () => {
    const media = stubMatchMedia(false);
    const { result } = renderHook(() => useMediaQuery("(min-width: 64rem)"));
    expect(result.current).toBe(false);
    media.set(true);
    expect(result.current).toBe(true);
  });

  it("useIsMobile asks for widths below 768px through the same hook", () => {
    const media = stubMatchMedia(true);
    expect(renderHook(() => useIsMobile()).result.current).toBe(true);
    expect(media.queries).toContain("(max-width: 767px)");
  });
});
