import { describe, expect, it, vi } from "vitest";

import type { DesignMockState } from "./design-rows";
import { MOCK_DESIGN_IDS } from "./design-seed";
import { createMemoryStorage } from "./design-storage";
import { createDesignMockStore } from "./design-store";

// The quote-request rules of the design mock that no route shows: what the store keeps when a
// draft carrying an open request is deleted (BE `DesignQuoteRequestService.closeOpen`, B40).

const NOW = new Date("2026-11-18T03:00:00Z");

async function storeWithStorage() {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const storage = createMemoryStorage();
  let ids = 0;
  const store = await createDesignMockStore({
    storage,
    now: () => NOW,
    newId: () => `5e5e0000-0000-4000-8000-${(0x2000 + ids++).toString(16).padStart(12, "0")}`,
    readImageSize: async () => ({ widthPx: 10, heightPx: 10 }),
    toUrl: (key) => `blob:test/${key}`,
  });
  await store.get(MOCK_DESIGN_IDS.returned); // seeds the storage
  const rows = async () => ((await storage.load())?.rows ?? {}) as DesignMockState;
  return { store, storage, rows };
}

describe("design mock quote requests", () => {
  it("seeds the approved design with one open request and nothing on a project", async () => {
    const { rows } = await storeWithStorage();
    const state = await rows();
    expect(state.quoteRequests).toEqual([
      expect.objectContaining({
        id: MOCK_DESIGN_IDS.approvedQuoteRequest,
        designId: MOCK_DESIGN_IDS.approved,
        status: "OPEN",
        cartons: 120,
      }),
    ]);
    expect(state.projectQuoteRequests).toEqual([]);
  });

  it("closes a deleted draft's open request, by nobody, and keeps the closed one", async () => {
    const { store, storage, rows } = await storeWithStorage();
    // The returned draft still carries the request it was sent with (B40).
    const state = await rows();
    state.quoteRequests.push({
      id: "5e5e0000-0000-4000-8000-0000000000aa",
      designId: MOCK_DESIGN_IDS.returned,
      cartons: 30,
      desiredDeliveryDate: null,
      status: "OPEN",
      requestedAt: "2026-11-16T03:00:00.000Z",
      closedAt: null,
      closedBy: null,
    });
    await storage.save({ rows: state });

    const removed = await store.remove(MOCK_DESIGN_IDS.returned, { version: 5 });
    expect(removed.status).toBe(200);
    expect((await rows()).quoteRequests.at(-1)).toEqual(
      expect.objectContaining({
        designId: MOCK_DESIGN_IDS.returned,
        status: "CLOSED",
        closedAt: NOW.toISOString(),
        closedBy: null,
      }),
    );
  });

  it("reads a snapshot stored before the quote requests as having none", async () => {
    const { store, storage, rows } = await storeWithStorage();
    const { quoteRequests: _q, projectQuoteRequests: _p, ...older } = await rows();
    await storage.save({ rows: older });
    const list = await store.designQuoteRequests(MOCK_DESIGN_IDS.approved);
    expect(list.status).toBe(200);
    expect((list.data as { data: unknown[] }).data).toEqual([]);
  });
});
