import { describe, expect, it } from "vitest";

import { resolveNotificationLink, toSafeNotificationPath } from "./link";

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

describe("resolveNotificationLink — BE order links open the customer's order page", () => {
  const id = "0e380000-0000-4000-8000-000000000201";

  it("maps the handover notice link /orders/{id} to /account/orders/{id}", () => {
    expect(resolveNotificationLink(`/orders/${id}`)).toBe(`/account/orders/${id}`);
    expect(resolveNotificationLink(`/orders/${id.toUpperCase()}`)).toBe(
      `/account/orders/${id.toUpperCase()}`,
    );
  });

  it("leaves a link that is already a storefront path, and other paths, unchanged", () => {
    expect(resolveNotificationLink(`/account/orders/${id}`)).toBe(`/account/orders/${id}`);
    expect(resolveNotificationLink("/orders")).toBe("/orders");
    expect(resolveNotificationLink(`/orders/${id}/extra`)).toBe(`/orders/${id}/extra`);
    expect(resolveNotificationLink("/orders/not-a-uuid")).toBe("/orders/not-a-uuid");
  });

  it("still refuses unsafe links", () => {
    expect(resolveNotificationLink("//evil.test/orders")).toBeNull();
    expect(resolveNotificationLink("/admin/orders")).toBeNull();
  });
});

describe("resolveNotificationLink — one case per link prefix the BE writes for a customer", () => {
  const id = "418eb759-eb5d-9cac-e62d-4bd9b766c254";

  it("maps the old design decision link /designs/{id} to /design/{id} (SF-UX-13)", () => {
    expect(resolveNotificationLink(`/designs/${id}`)).toBe(`/design/${id}`);
    expect(resolveNotificationLink(`/designs/${id.toUpperCase()}`)).toBe(
      `/design/${id.toUpperCase()}`,
    );
  });

  it("keeps the new design link /design/{id} (R5-1) as it is", () => {
    expect(resolveNotificationLink(`/design/${id}`)).toBe(`/design/${id}`);
  });

  it("leaves a /designs path that is not one design's link unchanged", () => {
    expect(resolveNotificationLink("/designs")).toBe("/designs");
    expect(resolveNotificationLink("/designs/not-a-uuid")).toBe("/designs/not-a-uuid");
    expect(resolveNotificationLink(`/designs/${id}/files`)).toBe(`/designs/${id}/files`);
  });

  it("maps /orders/{id} to the customer's order page", () => {
    expect(resolveNotificationLink(`/orders/${id}`)).toBe(`/account/orders/${id}`);
  });

  it("opens the e-invoice and chat links where the BE points (they are storefront pages)", () => {
    expect(resolveNotificationLink(`/einvoices/${id}`)).toBe(`/einvoices/${id}`);
    expect(resolveNotificationLink(`/chat/${id}`)).toBe(`/chat/${id}`);
  });
});
