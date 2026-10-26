import { beforeEach, describe, expect, it, vi } from "vitest";

import { forgetRequestId, requestIdFor } from "../request-id";

beforeEach(() => sessionStorage.clear());

describe("checkout idempotency key", () => {
  it("is the same for the same order content, across a reload (it lives in sessionStorage)", () => {
    const first = requestIdFor("order-A");
    expect(requestIdFor("order-A")).toBe(first);
    expect(sessionStorage.getItem("stockflow:storefront:checkout-request")).toContain(first);
  });

  it("changes when the order content changes: the BE would answer an edited cart with the old order", () => {
    const first = requestIdFor("order-A");
    const second = requestIdFor("order-B");
    expect(second).not.toBe(first);
    // Back to the first content gives a fresh key too: only the latest order matters.
    expect(requestIdFor("order-A")).not.toBe(first);
  });

  it("is a UUID", () => {
    expect(requestIdFor("x")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("is forgotten once the order exists, so the same cart ordered later is a new order", () => {
    const first = requestIdFor("order-A");
    forgetRequestId();
    expect(requestIdFor("order-A")).not.toBe(first);
  });

  it("survives damaged or blocked storage by falling back to a fresh key", () => {
    sessionStorage.setItem("stockflow:storefront:checkout-request", "{not json");
    expect(requestIdFor("order-A")).toMatch(/^[0-9a-f-]{36}$/);
    sessionStorage.setItem(
      "stockflow:storefront:checkout-request",
      JSON.stringify({ key: 1, id: 2 }),
    );
    expect(requestIdFor("order-A")).toMatch(/^[0-9a-f-]{36}$/);

    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(requestIdFor("order-A")).toMatch(/^[0-9a-f-]{36}$/);
    expect(() => forgetRequestId()).not.toThrow();
    vi.restoreAllMocks();
  });
});
