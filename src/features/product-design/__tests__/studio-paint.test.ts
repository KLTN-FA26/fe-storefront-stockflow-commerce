import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { releaseScratchLayer, scratchLayer } from "../components/studio/studio-paint";

beforeEach(() => {
  // jsdom has no canvas: hand out a context that records the clears.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () =>
      ({
        setTransform: vi.fn(),
        clearRect: vi.fn(),
        globalAlpha: 1,
        globalCompositeOperation: "source-over",
      }) as unknown as CanvasRenderingContext2D,
  );
});
afterEach(() => {
  releaseScratchLayer();
  vi.restoreAllMocks();
});

describe("the shared scratch composite (N2)", () => {
  it("is one canvas for every paint, grown to the largest asked for", () => {
    const first = scratchLayer(200, 100).source as HTMLCanvasElement;
    const second = scratchLayer(400, 50).source as HTMLCanvasElement;

    expect(second).toBe(first);
    expect([second.width, second.height]).toEqual([400, 100]);
  });

  it("hands its bitmap back when released, and starts afresh after", () => {
    const used = scratchLayer(2048, 2048).source as HTMLCanvasElement;
    releaseScratchLayer();

    expect([used.width, used.height]).toEqual([0, 0]);
    const next = scratchLayer(10, 10).source as HTMLCanvasElement;
    expect(next).not.toBe(used);
    expect([next.width, next.height]).toEqual([10, 10]);
  });

  it("does nothing when released with no composite drawn", () => {
    expect(() => releaseScratchLayer()).not.toThrow();
  });
});
