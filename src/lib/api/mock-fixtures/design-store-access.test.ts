import { afterEach, describe, expect, it, vi } from "vitest";

import { DESIGN_MOCK_LOCK, createExclusive } from "./design-store-access";

const later = <T>(value: T, ms: number) =>
  new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

describe("createExclusive", () => {
  afterEach(() => {
    Reflect.deleteProperty(navigator, "locks");
  });

  it("runs this tab's tasks one at a time, in order, even when an earlier one is slower or fails", async () => {
    const exclusive = createExclusive();
    const log: string[] = [];
    const task =
      (name: string, ms: number, fails = false) =>
      async () => {
        log.push(`start ${name}`);
        await later(null, ms);
        log.push(`end ${name}`);
        if (fails) throw new Error(name);
        return name;
      };

    const results = await Promise.allSettled([
      exclusive(task("a", 20, true)),
      exclusive(task("b", 1)),
      exclusive(task("c", 1)),
    ]);

    expect(log).toEqual(["start a", "end a", "start b", "end b", "start c", "end c"]);
    expect(results.map((r) => r.status)).toEqual(["rejected", "fulfilled", "fulfilled"]);
  });

  it("holds the Web Lock all tabs share while a task runs, when the browser has Web Locks", async () => {
    const request = vi.fn((name: string, callback: () => Promise<unknown>) => callback());
    Object.defineProperty(navigator, "locks", { value: { request }, configurable: true });
    const exclusive = createExclusive();

    expect(await exclusive(async () => "done")).toBe("done");
    expect(request).toHaveBeenCalledWith(DESIGN_MOCK_LOCK, expect.any(Function));
  });
});
