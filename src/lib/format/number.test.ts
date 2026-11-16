import { describe, expect, it } from "vitest";

import { formatFileSize } from "./number";

describe("formatFileSize", () => {
  it.each([
    [0, "0 B"],
    [820, "820 B"],
    [1_024, "1 KB"],
    [1_536, "1,5 KB"],
    [947_534, "925,3 KB"],
    [5_242_880, "5 MB"],
    [52_428_800, "50 MB"],
  ])("reads %d bytes as %s", (bytes, label) => {
    expect(formatFileSize(bytes)).toBe(label);
  });
});
