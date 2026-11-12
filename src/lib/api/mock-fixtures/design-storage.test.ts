import { afterEach, describe, expect, it, vi } from "vitest";

import { createIndexedDbStorage, createMemoryStorage, openDesignStorage } from "./design-storage";

async function bytesOf(blob: Blob): Promise<number[]> {
  return Array.from(new Uint8Array(await blob.arrayBuffer()));
}

/* ── A fake IndexedDB: only what design-storage.ts calls ─────────────────── */

type Handlers = Record<
  "onsuccess" | "onerror" | "onblocked" | "onupgradeneeded",
  (() => void) | null
>;
type FakeRequest = Handlers & { result: unknown; error: unknown };

function fakeRequest(): FakeRequest {
  return {
    onsuccess: null,
    onerror: null,
    onblocked: null,
    onupgradeneeded: null,
    result: undefined,
    error: null,
  };
}

/** A connection over the shared `data`; closed, it refuses transactions like the real one. */
function fakeConnection(data: Map<string, unknown>) {
  const db = {
    closed: false,
    onversionchange: null as (() => void) | null,
    onclose: null as (() => void) | null,
    close: vi.fn(() => {
      db.closed = true;
    }),
    transaction() {
      if (db.closed)
        throw new DOMException("The database connection is closing.", "InvalidStateError");
      const tx = { oncomplete: null as (() => void) | null, onerror: null, onabort: null };
      queueMicrotask(() => tx.oncomplete?.());
      return Object.assign(tx, {
        objectStore: (store: string) => ({
          get(key: string) {
            const req = fakeRequest();
            queueMicrotask(() => {
              req.result = data.get(`${store}/${key}`);
              req.onsuccess?.();
            });
            return req;
          },
          put: (value: unknown, key: string) => data.set(`${store}/${key}`, value),
          delete: (key: string) => data.delete(`${store}/${key}`),
          clear: () => undefined,
        }),
      });
    },
  };
  return db;
}

/**
 * An `indexedDB` whose `open` answers as `answer` says: `"success"` (a new connection over one
 * shared store), `"error"`, `"throw"`, or `"hold"` (nothing fires until the test calls a handler).
 */
function fakeIndexedDb(answer: "success" | "error" | "throw" | "hold" = "success") {
  const data = new Map<string, unknown>();
  const requests: FakeRequest[] = [];
  const connections: Array<ReturnType<typeof fakeConnection>> = [];
  const factory = {
    open: vi.fn(() => {
      if (answer === "throw") throw new DOMException("The operation is insecure.", "SecurityError");
      const req = fakeRequest();
      requests.push(req);
      if (answer === "success") {
        queueMicrotask(() => {
          const db = fakeConnection(data);
          connections.push(db);
          req.result = db;
          req.onsuccess?.();
        });
      } else if (answer === "error") {
        queueMicrotask(() => {
          req.error = new DOMException("Storage is blocked.", "UnknownError");
          req.onerror?.();
        });
      }
      return req;
    }),
  };
  vi.stubGlobal("indexedDB", factory);
  return { factory, requests, connections };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("memory design storage", () => {
  it("load returns null before the first save, then the saved snapshot (deep copy, not the same object)", async () => {
    const storage = createMemoryStorage();
    expect(storage.persistent).toBe(false);
    expect(await storage.load()).toBeNull();

    const snapshot = { rows: { designs: [{ id: "d1", name: "A" }], seq: { design: 1 } } };
    await storage.save(snapshot);

    const loaded = await storage.load();
    expect(loaded).toEqual(snapshot);
    expect(loaded).not.toBe(snapshot);

    // Later edits to the saved object or to a loaded copy must not leak into the store.
    snapshot.rows.designs.push({ id: "d2", name: "B" });
    (loaded!.rows.designs as unknown[]).push({ id: "d3", name: "C" });
    expect(await storage.load()).toEqual({
      rows: { designs: [{ id: "d1", name: "A" }], seq: { design: 1 } },
    });
  });

  it("putBlob then getBlob returns a blob with the same bytes and type; unknown key → null", async () => {
    const storage = createMemoryStorage();
    await storage.putBlob(
      "asset/a1",
      new Blob([new Uint8Array([1, 2, 3, 250])], { type: "image/png" }),
    );

    const blob = await storage.getBlob("asset/a1");
    expect(blob).not.toBeNull();
    expect(blob?.type).toBe("image/png");
    expect(await bytesOf(blob as Blob)).toEqual([1, 2, 3, 250]);
    expect(await storage.getBlob("asset/missing")).toBeNull();
  });

  it("deleteBlob removes one blob; deleting an unknown key is not an error", async () => {
    const storage = createMemoryStorage();
    await storage.putBlob("file/d1/1/PRINT_READY", new Blob(["a"]));
    await storage.putBlob("file/d1/2/PRINT_READY", new Blob(["b"]));

    await storage.deleteBlob("file/d1/1/PRINT_READY");
    await storage.deleteBlob("file/d1/9/PRINT_READY");

    expect(await storage.getBlob("file/d1/1/PRINT_READY")).toBeNull();
    expect(await storage.getBlob("file/d1/2/PRINT_READY")).not.toBeNull();
  });

  it("clear empties both the snapshot and the blobs", async () => {
    const storage = createMemoryStorage();
    await storage.save({ rows: { designs: [] } });
    await storage.putBlob("file/d1/front", new Blob(["x"], { type: "image/jpeg" }));

    await storage.clear();

    expect(await storage.load()).toBeNull();
    expect(await storage.getBlob("file/d1/front")).toBeNull();
  });
});

describe("IndexedDB design storage", () => {
  it("a connection closed for another tab's upgrade (versionchange) is reopened on the next call", async () => {
    const { factory, connections } = fakeIndexedDb();
    const storage = await createIndexedDbStorage("test-db");
    expect(storage.persistent).toBe(true);
    await storage.save({ rows: { designs: [] } });

    connections[0]!.onversionchange?.();
    expect(connections[0]!.close).toHaveBeenCalledTimes(1);

    expect(await storage.load()).toEqual({ rows: { designs: [] } });
    expect(factory.open).toHaveBeenCalledTimes(2);
    expect(connections[1]!.closed).toBe(false);
  });

  it("a connection the browser closed (close event) is reopened on the next call", async () => {
    const { factory, connections } = fakeIndexedDb();
    const storage = await createIndexedDbStorage("test-db");
    await storage.putBlob("asset/a1", new Blob(["x"]));

    connections[0]!.closed = true;
    connections[0]!.onclose?.();

    expect(await storage.getBlob("asset/a1")).not.toBeNull();
    expect(factory.open).toHaveBeenCalledTimes(2);
  });
});

describe("openDesignStorage", () => {
  it("falls back to memory when opening IndexedDB fails, and warns once with the reason", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    // A fresh module: the warning is once per page load.
    vi.resetModules();
    const { openDesignStorage: open } = await import("./design-storage");

    fakeIndexedDb("error");
    const storage = await open();
    expect(storage.persistent).toBe(false);
    await storage.save({ rows: { designs: [] } });
    expect(await storage.load()).toEqual({ rows: { designs: [] } });

    fakeIndexedDb("throw");
    expect((await open()).persistent).toBe(false);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("Storage is blocked."),
      expect.anything(),
    );
  });

  it("falls back to memory without an indexedDB at all", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("indexedDB", undefined);
    expect((await openDesignStorage()).persistent).toBe(false);
  });

  it("an open that is blocked falls back to memory; if it is let through later, that connection is closed", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { requests } = fakeIndexedDb("hold");
    const opening = openDesignStorage();
    await Promise.resolve();
    requests[0]!.onblocked?.();
    expect((await opening).persistent).toBe(false);

    const late = fakeConnection(new Map());
    requests[0]!.result = late;
    requests[0]!.onsuccess?.();

    expect(late.close).toHaveBeenCalledTimes(1);
  });

  it("uses IndexedDB when it opens", async () => {
    fakeIndexedDb();
    expect((await openDesignStorage()).persistent).toBe(true);
  });
});
