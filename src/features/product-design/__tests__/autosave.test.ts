import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/error";

import {
  AUTOSAVE_DELAY_MS,
  createAutosaver,
  offlineBackoffMs,
  type AutosaveChange,
} from "../autosave";
import { emptyDocument } from "../engine/document/factory";
import type { DesignDocument } from "../engine/document/schema";
import { cup12oz } from "../engine/__tests__/fixtures";

const T1 = "2026-10-25T08:00:00Z";
const T2 = "2026-10-25T08:05:00Z";

const conflict = () => new ApiError(409, "CONFLICT", "stale version");
const offline = () => new ApiError(0, "NETWORK_ERROR", "no network");
const serverError = () => new ApiError(500, "INTERNAL", "boom");

/** Distinct documents: the cup's empty document, tagged by SKU. */
const docs = (n: number): DesignDocument[] =>
  Array.from({ length: n }, (_, i) => ({ ...emptyDocument(cup12oz), sku: `CUP-${i + 1}` }));
const [d1, d2, d3] = docs(3) as [DesignDocument, DesignDocument, DesignDocument];

type SaveResult = { version: number; savedAt: string };

/** `save` stand-in whose every call stays open until the test settles it. */
function deferredSaves() {
  const calls: { resolve: (r: SaveResult) => void; reject: (e: unknown) => void }[] = [];
  const fn = vi.fn(
    (_doc: DesignDocument, _version: number) =>
      new Promise<SaveResult>((resolve, reject) => {
        calls.push({ resolve, reject });
      }),
  );
  return {
    fn,
    resolve: (i: number, r: SaveResult) => calls[i]!.resolve(r),
    reject: (i: number, e: unknown) => calls[i]!.reject(e),
  };
}

function setup(overrides: Partial<Parameters<typeof createAutosaver>[0]> = {}) {
  const changes: AutosaveChange[] = [];
  const onChange = vi.fn((change: AutosaveChange) => {
    changes.push(change);
  });
  const save = overrides.save ?? vi.fn().mockResolvedValue({ version: 4, savedAt: T1 });
  const saver = createAutosaver({ save, initialVersion: 3, onChange, ...overrides });
  const states = () => changes.map((c) => c.state);
  return {
    saver,
    save: save as ReturnType<typeof vi.fn>,
    changes,
    states,
    last: () => changes.at(-1)!,
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("debouncing", () => {
  it("saves the last document 1.5 s after the last change, with the known version", async () => {
    const { saver, save, states, last } = setup();
    saver.schedule(d1);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS - 1);
    saver.schedule(d2);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS - 1);
    expect(save).not.toHaveBeenCalled();
    expect(states()).toEqual(["pending"]);

    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(d2, 3);
    expect(states()).toEqual(["pending", "saving", "saved"]);
    expect(last()).toEqual({ state: "saved", version: 4, savedAt: T1 });
  });

  it("honours a custom delay", async () => {
    const { saver, save } = setup({ delayMs: 200 });
    saver.schedule(d1);
    await vi.advanceTimersByTimeAsync(199);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("reports nothing before the first change", () => {
    const { changes } = setup();
    expect(changes).toEqual([]);
  });
});

describe("one request in flight", () => {
  it("saves changes made during an in-flight save with the new version", async () => {
    const save = deferredSaves();
    const { saver, states } = setup({ save: save.fn });
    saver.schedule(d1);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    saver.schedule(d2);
    save.resolve(0, { version: 4, savedAt: T1 });
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);

    expect(save.fn).toHaveBeenNthCalledWith(1, d1, 3);
    expect(save.fn).toHaveBeenNthCalledWith(2, d2, 4);
    save.resolve(1, { version: 5, savedAt: T2 });
    await vi.advanceTimersByTimeAsync(0);
    expect(states()).toEqual(["pending", "saving", "pending", "saving", "saved"]);
  });

  it("never starts a second save while one is open, even after the debounce elapses", async () => {
    const save = deferredSaves();
    const { saver, states } = setup({ save: save.fn });
    saver.schedule(d1);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    saver.schedule(d2);
    saver.schedule(d3);
    await vi.advanceTimersByTimeAsync(10 * AUTOSAVE_DELAY_MS);
    expect(save.fn).toHaveBeenCalledTimes(1);
    expect(states().at(-1)).toBe("saving");

    // The save lands after the debounce already elapsed: the newest document goes out at once.
    save.resolve(0, { version: 4, savedAt: T1 });
    await vi.advanceTimersByTimeAsync(0);
    expect(save.fn).toHaveBeenCalledTimes(2);
    expect(save.fn).toHaveBeenLastCalledWith(d3, 4);
  });
});

describe("flush", () => {
  it("saves a pending document immediately and settles once it is stored", async () => {
    const { saver, save, last } = setup();
    saver.schedule(d1);
    await saver.flush();
    expect(save).toHaveBeenCalledWith(d1, 3);
    expect(last().state).toBe("saved");

    // The debounce was cancelled: nothing is saved twice.
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 2);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("does nothing, and reports nothing, when there is nothing to save", async () => {
    const { saver, save, changes } = setup();
    await saver.flush();
    expect(save).not.toHaveBeenCalled();
    expect(changes).toEqual([]);
  });

  it("waits for the open save, then saves what changed meanwhile", async () => {
    const save = deferredSaves();
    const { saver } = setup({ save: save.fn });
    saver.schedule(d1);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    saver.schedule(d2);

    let settled = false;
    const flushed = saver.flush().then(() => {
      settled = true;
    });
    save.resolve(0, { version: 4, savedAt: T1 });
    await vi.advanceTimersByTimeAsync(0);
    expect(save.fn).toHaveBeenNthCalledWith(2, d2, 4);
    expect(settled).toBe(false);

    save.resolve(1, { version: 5, savedAt: T2 });
    await flushed;
    expect(settled).toBe(true);
  });

  it("stops trying when the save fails instead of looping", async () => {
    const save = vi.fn().mockRejectedValue(serverError());
    const { saver, last } = setup({ save });
    saver.schedule(d1);
    await saver.flush();
    expect(save).toHaveBeenCalledTimes(1);
    expect(last().state).toBe("error");
  });
});

describe("a version conflict (409)", () => {
  it("stops autosave: the state is conflict and later changes are ignored", async () => {
    const save = vi.fn().mockRejectedValueOnce(conflict());
    const { saver, states, last } = setup({ save });
    saver.schedule(d1);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect(last().state).toBe("conflict");
    expect(last().version).toBe(3);

    saver.schedule(d2);
    await vi.advanceTimersByTimeAsync(10 * AUTOSAVE_DELAY_MS);
    expect(save).toHaveBeenCalledTimes(1);
    expect(states()).toEqual(["pending", "saving", "conflict"]);
  });

  it("recognises an optimistic-lock race as a conflict too", async () => {
    const save = vi.fn().mockRejectedValueOnce(new ApiError(409, "OPTIMISTIC_LOCK", "lost"));
    const { saver, last } = setup({ save });
    saver.schedule(d1);
    await saver.flush();
    expect(last().state).toBe("conflict");
  });

  it("does not save on flush or retry afterwards", async () => {
    const save = vi.fn().mockRejectedValueOnce(conflict());
    const { saver } = setup({ save });
    saver.schedule(d1);
    await saver.flush();
    saver.schedule(d2);
    await saver.flush();
    saver.retry();
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 2);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("stops on a conflict found elsewhere: the pending document is dropped, later changes ignored", async () => {
    const { saver, save, states, last } = setup();
    saver.schedule(d1);
    saver.conflict();
    expect(last().state).toBe("conflict");

    saver.schedule(d2);
    await saver.flush();
    saver.retry();
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 2);
    expect(save).not.toHaveBeenCalled();
    expect(states()).toEqual(["pending", "conflict"]);
  });

  it("keeps a conflict declared while a save was open", async () => {
    const saves = deferredSaves();
    const { saver, last } = setup({ save: saves.fn });
    saver.schedule(d1);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    saver.conflict();
    saves.resolve(0, { version: 4, savedAt: T1 });
    await vi.advanceTimersByTimeAsync(0);
    expect(last().state).toBe("conflict");
  });

  it("resumes after a reload: idle, nothing resent, the next change saved with the new version", async () => {
    const save = vi
      .fn()
      .mockRejectedValueOnce(conflict())
      .mockResolvedValueOnce({ version: 8, savedAt: T2 });
    const { saver, states, last } = setup({ save });
    saver.schedule(d1);
    await saver.flush();
    saver.schedule(d2); // the reloaded document is loaded into the editor: not a change to save

    saver.resume(7);
    expect(last()).toMatchObject({ state: "idle", version: 7 });
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 2);
    expect(save).toHaveBeenCalledTimes(1);

    saver.schedule(d3);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect(save).toHaveBeenLastCalledWith(d3, 7);
    expect(states().slice(-3)).toEqual(["pending", "saving", "saved"]);
  });
});

describe("offline", () => {
  it("does not send a request while isOnline() is false, and saves when the network is back", async () => {
    let online = false;
    const { saver, save, last } = setup({ isOnline: () => online });
    saver.schedule(d1);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect(save).not.toHaveBeenCalled();
    expect(last().state).toBe("offline");

    online = true;
    window.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenCalledWith(d1, 3);
    expect(last().state).toBe("saved");
  });

  it("treats a network failure (status 0) as offline and keeps the document for later", async () => {
    const save = vi
      .fn()
      .mockRejectedValueOnce(offline())
      .mockResolvedValueOnce({ version: 4, savedAt: T1 });
    const { saver, states, last } = setup({ save });
    saver.schedule(d1);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect(last().state).toBe("offline");
    expect(last().error).toBeInstanceOf(ApiError);

    await vi.advanceTimersByTimeAsync(offlineBackoffMs(0));
    expect(save).toHaveBeenNthCalledWith(2, d1, 3);
    expect(states()).toEqual(["pending", "saving", "offline", "saving", "saved"]);
  });

  it("backs off 2 s, 4 s, 8 s, then up to 30 s between attempts", async () => {
    expect([0, 1, 2, 3, 4, 5, 6, 20].map(offlineBackoffMs)).toEqual([
      2000, 4000, 8000, 16000, 30000, 30000, 30000, 30000,
    ]);

    const save = vi.fn().mockRejectedValue(offline());
    const { saver } = setup({ save });
    saver.schedule(d1);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    let calls = 1;
    for (const wait of [2000, 4000, 8000, 16000, 30000, 30000]) {
      await vi.advanceTimersByTimeAsync(wait - 1);
      expect(save).toHaveBeenCalledTimes(calls);
      await vi.advanceTimersByTimeAsync(1);
      expect(save).toHaveBeenCalledTimes(++calls);
    }
  });

  it("retries as soon as the network is back, and starts the backoff over", async () => {
    const save = vi
      .fn()
      .mockRejectedValueOnce(offline())
      .mockRejectedValueOnce(offline())
      .mockRejectedValueOnce(offline())
      .mockResolvedValue({ version: 4, savedAt: T1 });
    const { saver, last } = setup({ save });
    saver.schedule(d1);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS + 2000 + 4000);
    expect(save).toHaveBeenCalledTimes(3);
    expect(last().state).toBe("offline");

    window.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenCalledTimes(4);
    expect(last().state).toBe("saved");

    // The pending 8 s timer is gone: nothing else fires.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(save).toHaveBeenCalledTimes(4);
  });

  it("keeps the newest document while offline, and saves only that one", async () => {
    let online = false;
    const { saver, save } = setup({ isOnline: () => online });
    saver.schedule(d1);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    saver.schedule(d2);
    saver.schedule(d3);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 2);
    expect(save).not.toHaveBeenCalled();

    online = true;
    window.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(d3, 3);
  });

  it("a flush while offline sends nothing and settles", async () => {
    const { saver, save, last } = setup({ isOnline: () => false });
    saver.schedule(d1);
    await saver.flush();
    expect(save).not.toHaveBeenCalled();
    expect(last().state).toBe("offline");
  });
});

describe("other errors", () => {
  it("shows error, hands the failure to the caller and waits for retry()", async () => {
    const failure = serverError();
    const save = vi
      .fn()
      .mockRejectedValueOnce(failure)
      .mockResolvedValue({ version: 4, savedAt: T1 });
    const { saver, states, last } = setup({ save });
    saver.schedule(d1);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect(last()).toEqual({ state: "error", version: 3, error: failure });

    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(save).toHaveBeenCalledTimes(1);

    saver.retry();
    await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenLastCalledWith(d1, 3);
    expect(states()).toEqual(["pending", "saving", "error", "saving", "saved"]);
    expect(last().error).toBeUndefined();
  });

  it("exposes the refusal of an oversized document without retrying it", async () => {
    const tooLarge = new ApiError(413, "PAYLOAD_TOO_LARGE", "larger than 1000000 bytes");
    const save = vi.fn().mockRejectedValue(tooLarge);
    const { saver, last } = setup({ save });
    saver.schedule(d1);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect(last().state).toBe("error");
    expect(last().error).toBe(tooLarge);

    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("saves a change made after the failure once the quiet period passes, and recovers", async () => {
    const save = vi
      .fn()
      .mockRejectedValueOnce(serverError())
      .mockResolvedValue({ version: 4, savedAt: T1 });
    const { saver, states, last } = setup({ save });
    saver.schedule(d1);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect(last().state).toBe("error");

    saver.schedule(d2);
    expect(last().state).toBe("pending");
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS - 1);
    expect(save).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenLastCalledWith(d2, 3);
    expect(states()).toEqual(["pending", "saving", "error", "pending", "saving", "saved"]);
    expect(last()).toEqual({ state: "saved", version: 4, savedAt: T1 });
  });

  it("clears an oversize refusal once the customer simplifies the design", async () => {
    const tooLarge = new ApiError(413, "PAYLOAD_TOO_LARGE", "larger than 1000000 bytes");
    const save = vi
      .fn()
      .mockRejectedValueOnce(tooLarge)
      .mockResolvedValue({ version: 4, savedAt: T1 });
    const { saver, last } = setup({ save });
    saver.schedule(d1);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect(last().error).toBe(tooLarge);

    saver.schedule(d2); // fewer elements
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect(save).toHaveBeenLastCalledWith(d2, 3);
    expect(last().state).toBe("saved");
    expect(last().error).toBeUndefined();
  });

  it("goes back to error when the new attempt fails too, and retry() still saves at once", async () => {
    const save = vi
      .fn()
      .mockRejectedValueOnce(serverError())
      .mockRejectedValueOnce(serverError())
      .mockResolvedValue({ version: 4, savedAt: T1 });
    const { saver, last } = setup({ save });
    saver.schedule(d1);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    saver.schedule(d2);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect(save).toHaveBeenCalledTimes(2);
    expect(last().state).toBe("error");

    saver.schedule(d3);
    saver.retry(); // no waiting for the quiet period
    await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenCalledTimes(3);
    expect(save).toHaveBeenLastCalledWith(d3, 3);
    expect(last().state).toBe("saved");

    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 2); // the re-armed debounce is gone
    expect(save).toHaveBeenCalledTimes(3);
  });

  it("lets a change made during the failed save replace the document that failed", async () => {
    const save = deferredSaves();
    const { saver } = setup({ save: save.fn });
    saver.schedule(d1);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    saver.schedule(d2);
    save.reject(0, serverError());
    await vi.advanceTimersByTimeAsync(0);

    saver.retry();
    expect(save.fn).toHaveBeenNthCalledWith(2, d2, 3);
  });
});

describe("setVersion", () => {
  it("makes the next save carry the version adopted from another write", async () => {
    const { saver, save } = setup();
    saver.setVersion(7);
    saver.schedule(d1);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect(save).toHaveBeenCalledWith(d1, 7);
  });

  it("ignores a version that is not newer than the one it holds", async () => {
    const { saver, save } = setup();
    saver.setVersion(2);
    saver.setVersion(3);
    saver.schedule(d1);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect(save).toHaveBeenCalledWith(d1, 3);

    saver.setVersion(1);
    saver.schedule(d2);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect(save).toHaveBeenLastCalledWith(d2, 4);
  });

  it("applies to the next save when it arrives during a save in flight", async () => {
    const save = deferredSaves();
    const { saver, last } = setup({ save: save.fn });
    saver.schedule(d1);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    saver.setVersion(7);
    saver.schedule(d2);
    expect(save.fn).toHaveBeenCalledTimes(1);
    expect(save.fn).toHaveBeenCalledWith(d1, 3);

    // The open save was based on the old version; its answer must not pull the version back.
    save.resolve(0, { version: 4, savedAt: T1 });
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect(save.fn).toHaveBeenNthCalledWith(2, d2, 7);

    save.resolve(1, { version: 8, savedAt: T2 });
    await vi.advanceTimersByTimeAsync(0);
    expect(last()).toEqual({ state: "saved", version: 8, savedAt: T2 });
  });

  it("is still adopted after an error, for the retry", async () => {
    const save = vi
      .fn()
      .mockRejectedValueOnce(serverError())
      .mockResolvedValue({ version: 8, savedAt: T1 });
    const { saver } = setup({ save });
    saver.schedule(d1);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    saver.setVersion(7);
    saver.retry();
    await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenLastCalledWith(d1, 7);
  });
});

describe("dispose", () => {
  it("cancels the pending save and every listener", async () => {
    const save = vi.fn().mockRejectedValue(offline());
    const { saver, changes } = setup({ save });
    saver.schedule(d1);
    saver.dispose();
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 2);
    expect(save).not.toHaveBeenCalled();
    expect(changes.map((c) => c.state)).toEqual(["pending"]);

    saver.schedule(d2);
    window.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 2);
    expect(save).not.toHaveBeenCalled();
  });

  it("cancels the offline backoff", async () => {
    const save = vi.fn().mockRejectedValue(offline());
    const { saver } = setup({ save });
    saver.schedule(d1);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    saver.dispose();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("reports nothing about a save that lands afterwards", async () => {
    const save = deferredSaves();
    const { saver, states } = setup({ save: save.fn });
    saver.schedule(d1);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    saver.dispose();
    save.resolve(0, { version: 4, savedAt: T1 });
    await vi.advanceTimersByTimeAsync(0);
    expect(states()).toEqual(["pending", "saving"]);
  });
});
