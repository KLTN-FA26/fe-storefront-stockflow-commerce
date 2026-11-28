import { describe, expect, it } from "vitest";

import { faceName } from "../components/studio/face-name";

describe("faceName (UX audit S08-13)", () => {
  const areas = [{ code: "FRONT" as const, name: "Mặt trước" }];
  it("uses the template's own name", () => {
    expect(faceName(areas, ["FRONT", "BACK"], "FRONT")).toBe("Mặt trước");
  });
  it("falls back to 'Mặt N' by position, never the internal code", () => {
    expect(faceName(areas, ["FRONT", "BACK"], "BACK")).toBe("Mặt 2");
    expect(faceName([], ["FRONT", "BACK"], "FRONT")).toBe("Mặt 1");
  });
});
