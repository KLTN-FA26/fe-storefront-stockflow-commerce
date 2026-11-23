import { describe, expect, it } from "vitest";

import { currentHref, isCurrentPath } from "../nav-link";

describe("current nav link", () => {
  const main = ["/catalog", "/design", "/design/projects", "/account/quotes"];

  it("marks the page's own link, not a parent of it", () => {
    expect(currentHref("/design/projects/abc", main)).toBe("/design/projects");
    expect(currentHref("/design", main)).toBe("/design");
    expect(currentHref("/design/7f0c", main)).toBe("/design");
  });

  it("marks nothing on a page no link owns (the old fixed accent made 'Thiết kế của tôi' look selected everywhere)", () => {
    expect(currentHref("/account/orders/1", main)).toBeNull();
    expect(currentHref("/", main)).toBeNull();
  });

  it("does not treat a path that only shares a prefix as below the link", () => {
    expect(isCurrentPath("/designs/1", "/design")).toBe(false);
    expect(isCurrentPath("/catalog", "/catalog")).toBe(true);
  });
});
