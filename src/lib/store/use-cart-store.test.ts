import { beforeEach, describe, expect, it } from "vitest";

import { CART_QUANTITY_MAX, parsePersistedCart, useCartStore } from "./use-cart-store";

const line = (sku: string) => ({ sku, slug: sku.toLowerCase(), title: `Sản phẩm ${sku}` });

beforeEach(() => useCartStore.setState({ ownerId: null, lines: [] }));

describe("client cart", () => {
  it("keeps one line per SKU and adds quantities together", () => {
    const { add } = useCartStore.getState();
    add(line("CUP-1"), 1000);
    add(line("cup-1"), 500); // the BE upper-cases SKUs, so the cart does too
    add(line("CUP-2"), 10);
    expect(useCartStore.getState().lines).toEqual([
      { ...line("CUP-1"), quantity: 1500 },
      { ...line("CUP-2"), quantity: 10 },
    ]);
  });

  it("keeps a quantity a whole number of at least 1 and far below the BE's int", () => {
    const { add, setQuantity } = useCartStore.getState();
    add(line("CUP-1"), 0);
    expect(useCartStore.getState().lines[0]?.quantity).toBe(1);
    setQuantity("CUP-1", 2.9);
    expect(useCartStore.getState().lines[0]?.quantity).toBe(2);
    setQuantity("CUP-1", -5);
    expect(useCartStore.getState().lines[0]?.quantity).toBe(1);
    setQuantity("CUP-1", Number.MAX_SAFE_INTEGER);
    expect(useCartStore.getState().lines[0]?.quantity).toBe(CART_QUANTITY_MAX);
    setQuantity("CUP-1", Number.NaN);
    expect(useCartStore.getState().lines[0]?.quantity).toBe(1);
  });

  it("puts several lines in at once, merging into the basket or replacing it (reorder)", () => {
    const { add, addMany } = useCartStore.getState();
    add(line("CUP-1"), 100);
    add(line("CUP-9"), 5);
    addMany(
      [
        { ...line("CUP-1"), quantity: 50 },
        { ...line("cup-2"), quantity: 7 },
      ],
      "merge",
    );
    expect(useCartStore.getState().lines).toEqual([
      { ...line("CUP-1"), quantity: 150 },
      { ...line("CUP-9"), quantity: 5 },
      { ...line("cup-2"), sku: "CUP-2", quantity: 7 },
    ]);

    addMany([{ ...line("CUP-3"), quantity: 1 }], "replace");
    expect(useCartStore.getState().lines).toEqual([{ ...line("CUP-3"), quantity: 1 }]);
  });

  it("keeps merged quantities inside the cart's bounds", () => {
    const { add, addMany } = useCartStore.getState();
    add(line("CUP-1"), CART_QUANTITY_MAX - 1);
    addMany([{ ...line("CUP-1"), quantity: 10 }], "merge");
    expect(useCartStore.getState().lines[0]?.quantity).toBe(CART_QUANTITY_MAX);
  });

  it("removes a line by SKU, whatever its case, and clears", () => {
    const { add, remove, clear } = useCartStore.getState();
    add(line("CUP-1"), 1);
    add(line("CUP-2"), 1);
    remove("cup-1");
    expect(useCartStore.getState().lines.map((l) => l.sku)).toEqual(["CUP-2"]);
    clear();
    expect(useCartStore.getState().lines).toEqual([]);
  });

  it("lets the first account adopt lines added before sign-in, but never hands one account's lines to another", () => {
    const { add, bindOwner } = useCartStore.getState();
    add(line("CUP-1"), 1);
    bindOwner("user-a");
    expect(useCartStore.getState().lines).toHaveLength(1);
    bindOwner("user-a");
    expect(useCartStore.getState().lines).toHaveLength(1);
    bindOwner("user-b");
    expect(useCartStore.getState()).toMatchObject({ ownerId: "user-b", lines: [] });
  });
});

describe("what survives a reload", () => {
  it("keeps valid lines, drops damaged ones and duplicates, never throws", () => {
    const parsed = parsePersistedCart({
      ownerId: "user-a",
      lines: [
        { ...line("CUP-1"), quantity: 3 },
        { ...line("cup-1"), quantity: 9 }, // same SKU again
        { ...line("CUP-2"), quantity: 0 }, // not a quantity
        { sku: "CUP-3" }, // no title
        "garbage",
        null,
      ],
    });
    expect(parsed.ownerId).toBe("user-a");
    expect(parsed.lines).toEqual([{ ...line("CUP-1"), quantity: 3 }]);
  });

  it("starts empty from anything that is not a cart", () => {
    for (const raw of [undefined, null, 5, "x", [], { lines: "no" }]) {
      expect(parsePersistedCart(raw).lines).toEqual([]);
    }
  });
});
