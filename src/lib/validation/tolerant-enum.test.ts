import { describe, expect, it } from "vitest";

import { tolerantEnum } from "./tolerant-enum";

const colour = tolerantEnum(["RED", "BLUE"] as const);

describe("tolerantEnum", () => {
  it("keeps a known value and turns a newer one into UNKNOWN instead of throwing", () => {
    expect(colour.parse("RED")).toBe("RED");
    expect(colour.parse("GREEN")).toBe("UNKNOWN");
    expect(colour.parse("red")).toBe("UNKNOWN");
  });

  it("still fails when the field is missing or not a string: that is a broken contract", () => {
    expect(colour.safeParse(undefined).success).toBe(false);
    expect(colour.safeParse(null).success).toBe(false);
    expect(colour.safeParse(1).success).toBe(false);
  });
});
