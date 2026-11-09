import { describe, expect, it } from "vitest";

import { createMemoryStorage, openDesignStorage } from "./design-storage";

async function bytesOf(blob: Blob): Promise<number[]> {
  return Array.from(new Uint8Array(await blob.arrayBuffer()));
}

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

  it("clear empties both the snapshot and the blobs", async () => {
    const storage = createMemoryStorage();
    await storage.save({ rows: { designs: [] } });
    await storage.putBlob("file/d1/front", new Blob(["x"], { type: "image/jpeg" }));

    await storage.clear();

    expect(await storage.load()).toBeNull();
    expect(await storage.getBlob("file/d1/front")).toBeNull();
  });
});

describe("openDesignStorage", () => {
  it("falls back to memory when indexedDB is undefined (persistent === false)", async () => {
    expect(typeof indexedDB).toBe("undefined");
    const storage = await openDesignStorage();
    expect(storage.persistent).toBe(false);
    await storage.save({ rows: { designs: [] } });
    expect(await storage.load()).toEqual({ rows: { designs: [] } });
  });
});
