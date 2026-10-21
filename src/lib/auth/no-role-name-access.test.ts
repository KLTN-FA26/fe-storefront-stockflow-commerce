/**
 * Access is decided by permission codes (GET /identity/me/permissions), never by a role name
 * (lead's rule, 22/10; BE PR #148 has the same guard, NoRoleNameAccessTest). A role name in the
 * code is a second, hidden permission matrix: an administrator granting a permission in the BE
 * matrix would change nothing for that role.
 *
 * This scans the production source and fails on a role-name test. A line that names a role but does
 * not decide access goes in ALLOWED with the reason; an entry that no longer matches fails, so the
 * list cannot go stale.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { describe, expect, it } from "vitest";

const SRC = join(process.cwd(), "src");

const HUMAN_ROLES = [
  "System Admin",
  "Procurement Staff",
  "Warehouse Staff",
  "Warehouse Manager",
  "Inventory Planner",
  "QC Staff",
  "Accountant",
  "E-commerce Admin",
  "Sales Staff",
  "Order Coordinator",
];
const CODE_ROLES = [
  "SYSTEM_ADMIN",
  "SALES_STAFF",
  "WAREHOUSE_STAFF",
  "WAREHOUSE_MANAGER",
  "ORDER_COORDINATOR",
  "QC_STAFF",
  "ECOMMERCE_ADMIN",
  "PROCUREMENT_STAFF",
  "INVENTORY_PLANNER",
  "ACCOUNTANT",
  "CUSTOMER",
];
const quoted = (names: string[]) => new RegExp(`["'\`](?:${names.join("|")})["'\`]`);

export const PATTERNS: Array<{ name: string; test: (line: string) => boolean }> = [
  {
    name: "a test on the roles list",
    test: (l) => /\broles\??\.(includes|some|every|find|indexOf|filter|has)\(/.test(l),
  },
  { name: "a role comparison", test: (l) => /\broles?\s*[=!]==/.test(l) },
  { name: "hasRole / hasAuthority", test: (l) => /\b(hasRole|hasAnyRole|hasAuthority)\b/.test(l) },
  { name: "ROLE_ prefix", test: (l) => /\bROLE_[A-Z]/.test(l) },
  { name: "a role display name", test: (l) => quoted(HUMAN_ROLES).test(l) },
  {
    name: "a role code",
    // "CUSTOMER" is also a catalog price source (customer-specific price): not a role.
    test: (l) => quoted(CODE_ROLES).test(l) && !/\bsource\b|PRICE_SOURCES/.test(l),
  },
];

/** Where a role name may appear because it decides nothing, each with its reason. */
const ALLOWED: Array<{ file: string; line?: string; reason: string }> = [
  {
    file: "lib/api/mock-auth.ts",
    line: 'roles: ["CUSTOMER"]',
    reason: "mock BE: the demo account's role claim in the fake JWT, as the BE would issue it",
  },
  {
    file: "lib/api/mock-auth.ts",
    line: 'roles: ["SALES_STAFF"]',
    reason: "mock BE: a back-office demo account's role claim in the fake JWT",
  },
  {
    file: "lib/api/mock-my-permissions.ts",
    line: 'roles.includes("CUSTOMER")',
    reason:
      "mock BE: stands in for the BE resolving roles to permission codes (ADR-0008); the storefront only reads the codes it returns",
  },
  {
    file: "lib/api/mock-my-permissions.ts",
    line: 'roles: ["CUSTOMER"]',
    reason: "mock BE: the roles echo of GET /identity/me/permissions, display only",
  },
  {
    file: "lib/mock-data.ts",
    reason:
      "legacy back-office demo dataset (staff users with roles); only mock-adapter.ts imports it, to sign staff e-mails in and be refused",
  },
];

/** Files whose role names are test data, not production code. */
const isTestFile = (path: string) =>
  /(\.test\.[tj]sx?|\.spec\.[tj]sx?)$/.test(path) ||
  path.startsWith(`test${sep}`) ||
  path.includes(`${sep}__tests__${sep}`) ||
  path.startsWith(`_design${sep}`);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

/** A line with `//` and block comments removed (strings kept), so prose about roles does not trip it. */
function stripComments(text: string): string[] {
  const withoutBlocks = text.replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, " "));
  return withoutBlocks.split("\n").map((line) => line.replace(/(^|\s)\/\/.*$/, "$1"));
}

interface Hit {
  file: string;
  lineNumber: number;
  text: string;
  pattern: string;
}

function scan(): Hit[] {
  return sourceFiles(SRC).flatMap((path) => {
    const file = relative(SRC, path).split(sep).join("/");
    if (isTestFile(relative(SRC, path))) return [];
    return stripComments(readFileSync(path, "utf8")).flatMap((text, index) =>
      PATTERNS.filter((p) => p.test(text)).map((p) => ({
        file,
        lineNumber: index + 1,
        text: text.trim(),
        pattern: p.name,
      })),
    );
  });
}

const allowedBy = (hit: Hit) =>
  ALLOWED.find((a) => a.file === hit.file && (a.line === undefined || hit.text.includes(a.line)));

describe("no role name decides access", () => {
  const hits = scan();

  it("production code names a role only where it is allow-listed with a reason", () => {
    const offenders = hits
      .filter((hit) => !allowedBy(hit))
      .map((h) => `${h.file}:${h.lineNumber}  ${h.pattern}: ${h.text}`);
    expect(
      offenders,
      "Gate on a permission code (lib/auth/permission-codes.ts, useHasPermission), not on a role name",
    ).toEqual([]);
  });

  it("every allow-list entry still matches a line (a stale entry is removed)", () => {
    const stale = ALLOWED.filter(
      (entry) =>
        !hits.some(
          (h) => h.file === entry.file && (entry.line === undefined || h.text.includes(entry.line)),
        ),
    ).map((entry) => `${entry.file} ${entry.line ?? "(whole file)"}`);
    expect(stale).toEqual([]);
  });

  it("every allow-list entry gives a reason", () => {
    expect(ALLOWED.filter((entry) => entry.reason.trim().length < 20)).toEqual([]);
  });
});

describe("the scanner itself", () => {
  const flagged = (line: string) => PATTERNS.some((p) => p.test(line));

  it.each([
    'if (me.roles.includes("CUSTOMER")) ok();',
    "const isAdmin = user.roles.some((r) => r === x);",
    'if (roles.includes("System Admin")) return true;',
    'if (user.role === "SALES_STAFF") return;',
    'hasAnyRole("QC_STAFF")',
    'const r = "ROLE_ADMIN";',
    'const allowed = ["Warehouse Manager"];',
  ])("flags %s", (line) => expect(flagged(line)).toBe(true));

  it.each([
    'source: "CUSTOMER",',
    'export const PRICE_SOURCES = ["CUSTOMER", "SEGMENT", "BASE"] as const;',
    'const mayCancel = useHasPermission("sales-orders:UPDATE");',
    "const label = user.roles.join(', ');",
  ])("lets %s through", (line) => expect(flagged(line)).toBe(false));

  it("ignores prose in comments", () => {
    expect(
      stripComments('// System Admin never gets here\nconst a = 1; // "CUSTOMER"').join("\n"),
    ).not.toMatch(/System Admin|CUSTOMER/);
  });
});
