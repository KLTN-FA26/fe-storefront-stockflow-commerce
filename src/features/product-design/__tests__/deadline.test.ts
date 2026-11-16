import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { within } from "../components/studio/deadline";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("within", () => {
  it("answers the work and leaves no timer behind", async () => {
    await expect(within(Promise.resolve("done"), 15_000, "late")).resolves.toBe("done");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("answers the fallback once the time is up", async () => {
    const pending = within(new Promise<string>(() => undefined), 15_000, "late");
    await vi.advanceTimersByTimeAsync(15_000);
    await expect(pending).resolves.toBe("late");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("rejects with the signal's reason at once on an abort, and releases its timer and listener", async () => {
    const cancel = new AbortController();
    const off = vi.spyOn(cancel.signal, "removeEventListener");
    const pending = within(new Promise<string>(() => undefined), 15_000, "late", cancel.signal);
    expect(vi.getTimerCount()).toBe(1);

    cancel.abort();

    await expect(pending).rejects.toBe(cancel.signal.reason);
    expect(vi.getTimerCount()).toBe(0); // no 15 s timer left to fire
    expect(off).toHaveBeenCalledWith("abort", expect.any(Function));
  });

  it("releases the signal's listener and the timer when the work settles first", async () => {
    const cancel = new AbortController();
    const off = vi.spyOn(cancel.signal, "removeEventListener");

    await within(Promise.resolve(1), 15_000, 0, cancel.signal);

    expect(vi.getTimerCount()).toBe(0);
    expect(off).toHaveBeenCalledWith("abort", expect.any(Function));
  });

  it("rejects at once, with no timer, for a signal that is already aborted", async () => {
    const cancel = new AbortController();
    cancel.abort();
    await expect(within(new Promise(() => undefined), 15_000, 0, cancel.signal)).rejects.toBe(
      cancel.signal.reason,
    );
    expect(vi.getTimerCount()).toBe(0);
  });
});
