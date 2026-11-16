import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { IDLE_MS, schedulePaints } from "../components/studio/paint-schedule";

/** Frames asked for and not run yet, by id: `nextFrame` runs them, as the browser would. */
let frames: Map<number, FrameRequestCallback>;
let lastFrame = 0;
const nextFrame = () => {
  const due = [...frames.values()];
  frames.clear();
  for (const run of due) run(0);
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  frames = new Map();
  vi.stubGlobal("requestAnimationFrame", (run: FrameRequestCallback) => {
    frames.set(++lastFrame, run);
    return lastFrame;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("schedulePaints", () => {
  it("paints at most once a frame: every key asked for since the last one", () => {
    const paint = vi.fn();
    const schedule = schedulePaints<string>(paint);
    schedule.request(["FRONT"]);
    schedule.request(["BACK", "FRONT"]);
    expect(frames.size).toBe(1);
    nextFrame();
    expect(paint.mock.calls).toEqual([[["FRONT", "BACK"], "sharp"]]);
    nextFrame();
    expect(paint).toHaveBeenCalledTimes(1);
  });

  it("paints edits as a gesture, then once more sharp when the edits pause", () => {
    const paint = vi.fn();
    const schedule = schedulePaints<string>(paint);
    // A drag: one edit per frame.
    for (let frame = 0; frame < 3; frame++) {
      schedule.request(["BODY"], "edit");
      nextFrame();
      vi.advanceTimersByTime(16);
    }
    expect(paint.mock.calls).toEqual(Array(3).fill([["BODY"], "gesture"]));

    vi.advanceTimersByTime(IDLE_MS - 17);
    expect(frames.size).toBe(0);
    vi.advanceTimersByTime(1);
    nextFrame();
    expect(paint.mock.calls.at(-1)).toEqual([["BODY"], "sharp"]);
    expect(paint).toHaveBeenCalledTimes(4);
  });

  it("paints a zoom as a zoom (an edit meanwhile too), then sharp once it settles", () => {
    const paint = vi.fn();
    const schedule = schedulePaints<string>(paint);
    schedule.request(["BODY"], "zoom");
    nextFrame();
    schedule.request(["BODY"], "zoom");
    nextFrame();
    schedule.request(["BODY"], "edit");
    nextFrame();
    expect(paint.mock.calls).toEqual(Array(3).fill([["BODY"], "zoom"]));

    vi.advanceTimersByTime(IDLE_MS);
    nextFrame();
    expect(paint.mock.calls.at(-1)).toEqual([["BODY"], "sharp"]);
    // Settled: the next drag is a gesture again, not a zoom.
    schedule.request(["BODY"], "edit");
    nextFrame();
    expect(paint.mock.calls.at(-1)).toEqual([["BODY"], "gesture"]);
  });

  it("owes nothing once the sharp repaint is done, and paints a repaint (an image) sharp", () => {
    const paint = vi.fn();
    const schedule = schedulePaints<string>(paint);
    schedule.request(["FRONT"], "edit");
    nextFrame();
    vi.advanceTimersByTime(IDLE_MS);
    nextFrame();
    expect(paint.mock.calls).toEqual([
      [["FRONT"], "gesture"],
      [["FRONT"], "sharp"],
    ]);
    // A repaint after the gesture is sharp and leaves nothing owed.
    schedule.request(["BACK"], "repaint");
    nextFrame();
    vi.advanceTimersByTime(IDLE_MS);
    nextFrame();
    expect(paint.mock.calls.at(-1)).toEqual([["BACK"], "sharp"]);
    expect(paint).toHaveBeenCalledTimes(3);
  });

  it("paints nothing once disposed", () => {
    const paint = vi.fn();
    const schedule = schedulePaints<string>(paint);
    schedule.request(["BODY"], "edit");
    schedule.dispose();
    vi.advanceTimersByTime(IDLE_MS);
    nextFrame();
    expect(paint).not.toHaveBeenCalled();
  });
});
