/**
 * Submitting a design in the design mock (spec 2026-11-09 §4.2, §4.5 "Submission"):
 *  - a submission (docs 12 §4.3, BR-05, BR-07) needs a DRAFT at the sent version, a passing
 *    browser preflight, the server's own re-check of what it can see (variant ACTIVE, carton spec,
 *    content, every placed image stored and within the rules), then the three files whose SHA-256
 *    match what the browser sent. A preflight refusal is recorded as PREFLIGHT_FAILED;
 *  - the files are stored before the rows that list them, under keys of the version the
 *    submission gives the design: a write that fails part-way deletes what it stored and leaves
 *    the rows and the earlier submission as they were. Once the rows are saved, the earlier
 *    submission's files are deleted.
 */

import type { DesignDocument } from "@/features/product-design/engine/document/schema";
import { variantIssues } from "@/features/product-design/engine/preflight/rules/variant";
import type { PreflightIssue } from "@/features/product-design/engine/preflight/types";
import type { PrintAreaCode } from "@/features/product-design/engine/template/schema";

import { isUsable } from "./design-print-configs";
import {
  BUNDLE_ROLES,
  fileBlobKey,
  fileKey,
  fileRejected,
  invalid,
  invalidState,
  isIssue,
  isVersion,
  issuesNote,
  notFound,
  ok,
  preflightFailed,
  versionConflict,
  type BundleRole,
  type DesignRow,
  type FileRow,
  type MockResult,
} from "./design-rows";
import {
  assetUsable,
  assetsOf,
  hashOf,
  mimeOf,
  nameOf,
  withBlobs,
  type DesignFiles,
  type FilesContext,
} from "./design-store-files";

/** The multipart parts of POST /designs/{id}/submissions, as the route read them. */
export type DesignSubmission = {
  version: unknown;
  /** `{ result: "Pass" | "Fail", issues }`, the browser's preflight. */
  preflight: unknown;
  /** `{ PRINT_READY, CUSTOMER_PREVIEW, TECHNICAL_SPEC }`: SHA-256 hex of each file. */
  checksums: unknown;
  files: Partial<Record<BundleRole, Blob>>;
};

const FALLBACK_NAMES: Record<BundleRole, string> = {
  CUSTOMER_PREVIEW: "preview.png",
  PRINT_READY: "print-ready.pdf",
  TECHNICAL_SPEC: "technical-spec.pdf",
};

/** The browser's preflight, or null when it is not `{ result: Pass | Fail, issues: [...] }`. */
function readPreflight(
  value: unknown,
): { result: "Pass" | "Fail"; issues: PreflightIssue[] } | null {
  if (typeof value !== "object" || value === null) return null;
  const { result, issues } = value as { result?: unknown; issues?: unknown };
  if (result !== "Pass" && result !== "Fail") return null;
  if (!Array.isArray(issues) || !issues.every(isIssue)) return null;
  return { result, issues };
}

export function createDesignSubmission(ctx: FilesContext, files: DesignFiles) {
  /** What the server re-checks of the browser's preflight (spec §4.2), as engine-shaped issues. */
  async function recheck(row: DesignRow): Promise<PreflightIssue[]> {
    const config = ctx.configOf(row);
    const issues = variantIssues({
      usable: config !== null && isUsable(config),
      hasCartonSpec: config?.hasCartonSpec ?? true,
    });
    const { document } = ctx.state().documents[row.id]!;
    const surfaces = Object.entries(document.surfaces) as Array<
      [PrintAreaCode, DesignDocument["surfaces"][PrintAreaCode]]
    >;
    // docs 12 §3 (BR-05), as the engine's EMPTY_DESIGN: a visible image, text or drawing on some
    // surface; a background (colour or pattern) alone is not a design.
    const hasContent = surfaces.some(
      ([, surface]) => surface?.elements.some((el) => !el.hidden) ?? false,
    );
    if (!hasContent) {
      issues.push({ ruleId: "EMPTY_DESIGN", level: "fail", message: "Thiết kế chưa có nội dung." });
    }
    const assets = assetsOf(ctx, row.id);
    for (const [surfaceCode, surface] of surfaces) {
      for (const el of surface?.elements ?? []) {
        if (el.type !== "image" || el.hidden) continue;
        const asset = assets.find((a) => a.assetId === el.assetId);
        if (await assetUsable(ctx, asset, row)) continue;
        issues.push({
          ruleId: "ASSET_INVALID",
          level: "fail",
          message: "Ảnh không hợp lệ hoặc không tải được.",
          surfaceCode,
          elementId: el.id,
        });
      }
    }
    return issues;
  }

  /** 422 PREFLIGHT_FAILED, on the record (docs 12 §5.3); the design stays as it was. */
  async function refusePreflight(row: DesignRow, issues: PreflightIssue[]): Promise<MockResult> {
    ctx.record(row, "PREFLIGHT_FAILED", issuesNote(issues), row.version);
    await ctx.persist();
    return preflightFailed(issues);
  }

  return {
    /** POST /designs/{id}/submissions — DRAFT → PENDING_REVIEW. */
    async submit(id: string, form: DesignSubmission): Promise<MockResult> {
      const row = ctx.find(id);
      if (!row) return notFound();
      const { version } = form;
      if (!isVersion(version)) return invalid("version", "version must be a whole number ≥ 0");
      const preflight = readPreflight(form.preflight);
      if (!preflight) return invalid("preflight", "preflight must be { result, issues }");
      // A Fail names what failed: without a fail-level issue there is nothing to record or show.
      if (preflight.result === "Fail" && !preflight.issues.some((i) => i.level === "fail")) {
        return invalid("preflight", "a Fail preflight lists at least one fail issue");
      }
      if (row.status !== "DRAFT") return invalidState();
      if (row.version !== version) return versionConflict();

      if (preflight.result === "Fail") return refusePreflight(row, preflight.issues);
      const issues = await recheck(row);
      if (issues.length) return refusePreflight(row, issues);

      const missing = BUNDLE_ROLES.filter((role) => !form.files[role]);
      if (missing.length) return fileRejected(`Missing ${missing.join(", ")}`);
      const sent = (form.checksums ?? {}) as Partial<Record<BundleRole, unknown>>;
      const hashes = await Promise.all(BUNDLE_ROLES.map((role) => hashOf(form.files[role]!)));
      const mismatched = BUNDLE_ROLES.filter((role, i) => sent[role] !== hashes[i]);
      if (mismatched.length) return fileRejected(`Checksum mismatch: ${mismatched.join(", ")}`);

      // The bytes first, under keys of the version this submission gives the design: should a
      // write fail, they are deleted again and the rows still list the earlier submission.
      const storedAt = ctx.stamp();
      const submitted: FileRow[] = BUNDLE_ROLES.map((role, i) => {
        const file = form.files[role]!;
        return {
          designId: id,
          role,
          name: nameOf(file, FALLBACK_NAMES[role]),
          contentType: mimeOf(file),
          sizeBytes: file.size,
          sha256: hashes[i]!,
          storedAt,
          key: fileKey(id, role, row.version + 1),
        };
      });
      const state = ctx.state();
      const earlier = state.files.filter((f) => f.designId === id).map(fileBlobKey);
      await withBlobs(ctx, async (put) => {
        for (const file of submitted) await put(fileBlobKey(file), form.files[file.role]!);
        state.files = [...state.files.filter((f) => f.designId !== id), ...submitted];
        row.status = "PENDING_REVIEW";
        ctx.advance(row, "SUBMITTED_FOR_REVIEW", null);
        row.submittedAt = row.updatedAt;
        await ctx.persist();
      });
      const keys = submitted.map(fileBlobKey);
      await ctx.discardBlobs(earlier.filter((key) => !keys.includes(key)));
      return ok(await files.toDto(row));
    },
  };
}
