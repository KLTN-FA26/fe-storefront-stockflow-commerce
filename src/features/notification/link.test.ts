import { describe, expect, it } from "vitest";

import { toSafeNotificationPath } from "./link";

describe("toSafeNotificationPath — strict root-relative storefront policy (SCRUM-147)", () => {
  it.each([
    ["/account/orders", "/account/orders"],
    [
      "/account/orders/0e380000-0000-4000-8000-000000000201",
      "/account/orders/0e380000-0000-4000-8000-000000000201",
    ],
    ["/products?category=cups#top", "/products?category=cups#top"],
    ["/", "/"],
    ["/administrator", "/administrator"],
  ])("keeps the canonical in-app path %s", (raw, expected) => {
    expect(toSafeNotificationPath(raw)).toBe(expected);
  });

  it.each([
    ["back-office deep link (BE staff notice)", "/admin/inventory/alerts?kind=EXPIRED"],
    ["back-office root", "/admin"],
    ["back-office via dot segment", "/account/../admin/orders"],
    ["back-office via encoded dot segment", "/account/%2e%2e/admin"],
    ["BFF", "/api/backend/identity/me"],
    ["absolute URL", "https://evil.test/account"],
    ["same-origin absolute URL", "http://localhost:3000/account"],
    ["scheme", "javascript:alert(1)"],
    ["protocol-relative", "//evil.test/account"],
    ["backslash host", "/\\evil.test"],
    ["tab bypass (parser strips → //evil)", "/\t/evil.test"],
    ["newline bypass", "/\n/evil.test"],
    ["carriage return", "/account/\r/x"],
    ["NUL", "/account/\u0000"],
    ["space", "/account/ orders"],
    ["fullwidth solidus look-alike", "/／evil.test"],
    ["non-ASCII", "/tài-khoản"],
    ["encoded slash", "/%2F%2Fevil.test"],
    ["encoded backslash", "/%5Cevil.test"],
    ["relative path", "account/orders"],
    ["empty", ""],
    ["oversized", `/account/${"a".repeat(2100)}`],
  ])("rejects %s", (_, raw) => {
    expect(toSafeNotificationPath(raw)).toBeNull();
  });
});
