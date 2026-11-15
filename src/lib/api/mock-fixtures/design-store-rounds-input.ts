/**
 * The bodies of the set submission's writes in the design mock (`design-store-rounds.ts`), read
 * and refused (422 VALIDATION_FAILED) before anything else is looked at.
 */

import type { PreflightIssue } from "@/features/product-design/engine/preflight/types";

import {
  BUNDLE_ROLES,
  asRecord,
  invalid,
  isIssue,
  isVersion,
  issuesNote,
  type BundleRole,
  type MockResult,
} from "./design-rows";
import { readPreflight } from "./design-store-submission";

/** One design of a round, as `POST /design-projects/{id}/review-rounds` lists it. */
export type RoundItem = {
  designId: string;
  version: number;
  uploadToken: string;
  preflight: { result: "Pass" | "Fail"; issues: PreflightIssue[] };
  checksums: Record<BundleRole, string>;
};

/** One design whose check failed, as a round's refusal or `…/preflight-failures` names it. */
export type DesignFailure = { designId: string; issues: PreflightIssue[] };

type Read<T> = { items: T[] } | { refused: MockResult };

const isFail = (issue: PreflightIssue) => issue.level === "fail";
const isRefusal = (value: object): value is MockResult => "status" in value && "data" in value;

/** The three checksums by role, or null when one is missing. */
function readChecksums(value: unknown): Record<BundleRole, string> | null {
  const sent = asRecord(value);
  const sums: Partial<Record<BundleRole, string>> = {};
  for (const role of BUNDLE_ROLES) {
    const sum = sent[role];
    if (typeof sum !== "string" || !sum) return null;
    sums[role] = sum;
  }
  return sums as Record<BundleRole, string>;
}

/**
 * `{ items: [...] }`, each read by `readItem` (which answers the item, or the reason it is refused)
 * and naming a design once.
 */
function readList<T extends { designId: string }>(
  body: unknown,
  readItem: (item: Record<string, unknown>, field: (name: string) => string) => T | MockResult,
): Read<T> {
  const { items } = asRecord(body);
  if (!Array.isArray(items)) return { refused: invalid("items", "items must be a list") };
  const read: T[] = [];
  for (const [i, value] of items.entries()) {
    const field = (name: string) => `items[${i}].${name}`;
    const { designId } = asRecord(value);
    if (typeof designId !== "string" || !designId.trim()) {
      return { refused: invalid(field("designId"), "designId must not be blank") };
    }
    if (read.some((other) => other.designId === designId)) {
      return { refused: invalid(field("designId"), "a design is sent once") };
    }
    const item = readItem(asRecord(value), field);
    if (isRefusal(item)) return { refused: item };
    read.push(item);
  }
  return { items: read };
}

/** The items of a round's body. */
export const readRoundItems = (body: unknown): Read<RoundItem> =>
  readList(body, (item, field) => {
    const { designId, version, uploadToken } = item as { designId: string } & typeof item;
    if (!isVersion(version)) return invalid(field("version"), "version must be a whole number ≥ 0");
    if (typeof uploadToken !== "string" || !uploadToken.trim()) {
      return invalid(field("uploadToken"), "uploadToken must not be blank");
    }
    const preflight = readPreflight(item.preflight);
    // A Fail names what failed, as a single submission's does.
    if (!preflight || (preflight.result === "Fail" && !preflight.issues.some(isFail))) {
      return invalid(field("preflight"), "preflight must be { result, issues }");
    }
    const checksums = readChecksums(item.checksums);
    if (!checksums) return invalid(field("checksums"), "checksums must give each file's SHA-256");
    return { designId, version, uploadToken, preflight, checksums };
  });

/** The items of `POST /design-projects/{id}/preflight-failures`: at least one, each with issues. */
export function readFailures(body: unknown): Read<DesignFailure> {
  const read = readList<DesignFailure>(body, (item, field) => {
    const { designId, issues } = item as { designId: string } & typeof item;
    if (!Array.isArray(issues) || !issues.length || !issues.every(isIssue)) {
      return invalid(field("issues"), "issues must list what failed");
    }
    return { designId, issues };
  });
  if ("items" in read && !read.items.length) {
    return { refused: invalid("items", "items must name a design") };
  }
  return read;
}

/** A failed check of a set, as one history note: each design's issues (docs 12 §5.4). */
export const failuresNote = (failures: readonly DesignFailure[]) =>
  failures.map((failure) => `${failure.designId}: ${issuesNote(failure.issues)}`).join(" | ");
