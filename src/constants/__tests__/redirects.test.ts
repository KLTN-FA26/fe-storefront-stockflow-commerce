import type { IncomingMessage } from "node:http";

import { getPathMatch } from "next/dist/shared/lib/router/utils/path-match";
import { matchHas } from "next/dist/shared/lib/router/utils/prepare-destination";
import { describe, expect, it } from "vitest";

import { STOREFRONT_REDIRECTS } from "../redirects";

/** Resolves a URL the way Next applies `redirects()`: first source + `has` match wins. */
function redirectOf(url: string): string | undefined {
  const { pathname, searchParams } = new URL(url, "http://shop.test");
  const query = Object.fromEntries(searchParams);
  const request = { headers: {}, cookies: {} } as unknown as IncomingMessage;
  for (const rule of STOREFRONT_REDIRECTS) {
    const params = getPathMatch(rule.source, { removeUnnamedParams: true, strict: true })(pathname);
    if (!params) continue;
    if (rule.has && !matchHas(request, query, rule.has)) continue;
    return rule.destination.replace(/:(\w+)/g, (_, name: string) => String(params[name]));
  }
  return undefined;
}

describe("storefront redirects (next.config.ts)", () => {
  it("sends a catalogue search to /search (SCRUM-469)", () => {
    expect(redirectOf("/catalog?q=hoodie&sort=title")).toBe("/search");
  });

  it("leaves the catalogue alone without a search text", () => {
    expect(redirectOf("/catalog")).toBeUndefined();
    expect(redirectOf("/catalog?q=")).toBeUndefined();
    expect(redirectOf("/catalog?page=2")).toBeUndefined();
  });

  it("moves the old product URL /catalog/{slug} to /catalog/products/{slug}", () => {
    expect(redirectOf("/catalog/ly-giay-2-lop-8oz")).toBe("/catalog/products/ly-giay-2-lop-8oz");
  });

  it("sends the bare /catalog/products to the catalogue, and never loops", () => {
    expect(redirectOf("/catalog/products")).toBe("/catalog");
    expect(redirectOf("/catalog/products/ly-giay-2-lop-8oz")).toBeUndefined();
    expect(redirectOf("/search?q=hoodie")).toBeUndefined();
  });
});
