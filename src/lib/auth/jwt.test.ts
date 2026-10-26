import { describe, expect, it } from "vitest";

import { isTokenExpired, readJwtExpiry } from "./jwt";

const b64url = (value: unknown) =>
  btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const tokenWith = (claims: unknown) => `${b64url({ alg: "RS256" })}.${b64url(claims)}.signature`;
const NOW = Date.UTC(2026, 9, 19, 3, 0, 0);
const at = (offsetSeconds: number) => Math.floor(NOW / 1000) + offsetSeconds;

describe("JWT expiry, read client-side", () => {
  it("reads exp (seconds) as milliseconds, including a base64url payload", () => {
    expect(readJwtExpiry(tokenWith({ exp: 1_800_000_000 }))).toBe(1_800_000_000_000);
    // A payload whose base64 has `-`/`_` and no padding.
    expect(readJwtExpiry(tokenWith({ exp: 1_800_000_000, name: "???>>>~~~" }))).toBe(
      1_800_000_000_000,
    );
  });

  it("is expired once exp has passed, and a few seconds before it", () => {
    expect(isTokenExpired(tokenWith({ exp: at(-1) }), NOW)).toBe(true);
    expect(isTokenExpired(tokenWith({ exp: at(5) }), NOW)).toBe(true); // within the 10 s skew
    expect(isTokenExpired(tokenWith({ exp: at(60) }), NOW)).toBe(false);
  });

  it("leaves a token it cannot read to the BE: not expired", () => {
    for (const token of [
      "opaque",
      "a.b.c",
      "a..c",
      tokenWith({}),
      tokenWith({ exp: "soon" }),
      tokenWith(null),
    ]) {
      expect(isTokenExpired(token, NOW)).toBe(false);
      expect(readJwtExpiry(token)).toBeUndefined();
    }
  });
});
