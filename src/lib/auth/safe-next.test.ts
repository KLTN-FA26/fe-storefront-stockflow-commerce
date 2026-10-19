import { describe, expect, it } from "vitest";

import { loginUrl, safeNextPath } from "./safe-next";

describe("safeNextPath: where to go after signing in", () => {
  it("keeps a same-origin relative path with its query and hash", () => {
    expect(safeNextPath("/account/orders?page=2#top")).toBe("/account/orders?page=2#top");
    expect(safeNextPath("/catalog/ly-giay")).toBe("/catalog/ly-giay");
  });

  it.each([
    "https://evil.example/phish",
    "http://evil.example",
    "//evil.example/x",
    "/\\evil.example",
    "\\\\evil.example",
    "javascript:alert(1)",
    "evil.example",
    "account/orders",
    "",
  ])("refuses %j and goes to the fallback", (next) => {
    expect(safeNextPath(next)).toBe("/");
    expect(safeNextPath(next, "/account")).toBe("/account");
  });

  it("falls back for null, undefined and the login page itself (no loop)", () => {
    expect(safeNextPath(null)).toBe("/");
    expect(safeNextPath(undefined)).toBe("/");
    expect(safeNextPath("/login")).toBe("/");
    expect(safeNextPath("/login?next=/cart")).toBe("/");
  });
});

describe("loginUrl", () => {
  it("remembers where the customer was, encoded", () => {
    expect(loginUrl("/cart?a=1")).toBe("/login?next=%2Fcart%3Fa%3D1");
  });

  it("has no next for the home page, the login page or an unsafe path", () => {
    expect(loginUrl("/")).toBe("/login");
    expect(loginUrl("/login")).toBe("/login");
    expect(loginUrl("//evil.example")).toBe("/login");
    expect(loginUrl()).toBe("/login");
  });
});
