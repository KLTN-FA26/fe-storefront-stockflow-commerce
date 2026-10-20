import { describe, expect, it } from "vitest";

import { beId } from "./primitives";

describe("beId", () => {
  it("accepts any 8-4-4-4-12 hex id, as Java's UUID does (dev data has non-RFC ids)", () => {
    for (const id of [
      "e5c50b95-014a-18a3-7a2b-5fd7a1dcb8ed",
      "d2738a4c-38f0-d893-b2d5-349038e4bb20",
      "0199f1a2-3b4c-7d8e-9f00-112233445566",
    ]) {
      expect(beId().safeParse(id).success).toBe(true);
    }
  });

  it("still refuses what is not an id", () => {
    for (const bad of ["", "nope", "e5c50b95-014a-18a3-7a2b", "../orders/x"]) {
      expect(beId().safeParse(bad).success).toBe(false);
    }
  });
});
