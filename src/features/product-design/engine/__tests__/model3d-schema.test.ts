// @vitest-environment node
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { model3dRefSchema } from "../model3d/schema";

const valid = {
  url: "/models/cup.glb",
  surfaces: [{ printAreaCode: "BODY", meshName: "print:BODY" }],
};
const refuses = (value: unknown) => expect(() => model3dRefSchema.parse(value)).toThrow(z.ZodError);

describe("model3d reference (spec 2026-11-13 §3)", () => {
  it("accepts a url with one surface", () => {
    expect(model3dRefSchema.parse(valid)).toEqual(valid);
  });

  it("accepts several surfaces, one per print area", () => {
    const surfaces = [
      { printAreaCode: "FRONT", meshName: "print:FRONT" },
      { printAreaCode: "BACK", meshName: "print:BACK" },
    ];
    expect(model3dRefSchema.parse({ ...valid, surfaces }).surfaces).toHaveLength(2);
  });

  it("refuses an empty url", () => {
    refuses({ ...valid, url: "" });
  });

  it("refuses no surfaces", () => {
    refuses({ ...valid, surfaces: [] });
  });

  it("refuses the same print area twice", () => {
    refuses({
      ...valid,
      surfaces: [
        { printAreaCode: "BODY", meshName: "print:BODY" },
        { printAreaCode: "BODY", meshName: "print:BODY" },
      ],
    });
  });

  it("refuses an unknown print area code", () => {
    refuses({ ...valid, surfaces: [{ printAreaCode: "TOP", meshName: "print:TOP" }] });
  });

  it("refuses an empty mesh name", () => {
    refuses({ ...valid, surfaces: [{ printAreaCode: "BODY", meshName: "" }] });
  });

  it("refuses a mesh name that is not print: plus the entry's own print area code", () => {
    refuses({ ...valid, surfaces: [{ printAreaCode: "BODY", meshName: "body" }] });
    refuses({ ...valid, surfaces: [{ printAreaCode: "BODY", meshName: "print:FRONT" }] });
    refuses({ ...valid, surfaces: [{ printAreaCode: "BODY", meshName: "print:BODY " }] });
  });
});
