/**
 * WF-05 Q-11 (BE 20157b28): the custody endpoints of a return - POST /returns/{id}/custody and
 * /returns/{id}/custody/uploads - are the back office's only and answer 403 to a portal caller. Goods
 * kept in custody are the warehouse's note, not the customer's claim; the storefront never calls them.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const SRC = path.resolve(__dirname, "../../..");
const THIS_FILE = path.resolve(__filename);

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sources(full);
    return /\.(ts|tsx)$/.test(entry.name) && full !== THIS_FILE ? [full] : [];
  });
}

describe("the storefront never calls the custody endpoints (403 to a portal caller)", () => {
  it("no source names a /custody path", () => {
    const files = sources(SRC);
    expect(files.length).toBeGreaterThan(100);
    const callers = files.filter((file) => /\/custody\b/i.test(readFileSync(file, "utf8")));
    expect(callers).toEqual([]);
  });
});
