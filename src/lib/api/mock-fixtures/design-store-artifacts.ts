/**
 * A design's files the way the BE has them (`DesignController`, `DesignWorkflowController`): each of
 * the three files of a submission is uploaded on its own as an artifact, naming the layout it was
 * drawn from, and a request for review then checks them (`origin/develop` 85e6036a):
 *  - an upload needs a DRAFT (a repeat of a key does not: it only answers), moves the design's
 *    version on, and replaces the role's file in the store's rows (`state.files`, one per role);
 *  - the same `Idempotency-Key` with the same bytes and layout answers the first artifact again,
 *    even when a later upload has replaced it (`state.artifactUploads` keeps every keyed upload),
 *    and does not make it current again (`DesignArtifactService.upload`: `attachArtifact` runs only
 *    for a new artifact); with other bytes or another layout it is 422 `IDEMPOTENCY_KEY_REUSED`;
 *  - the request (`{ version, quoteRequest? }`; the quote request in `design-store-quotes.ts`) is refused with 409 `CONFLICT` for a stale version, 409
 *    `DESIGN_NOT_DRAFT`, 422 `DESIGN_PREFLIGHT_FAILED` (on the record, issues in the BE's shape:
 *    `{rule, surfaceCode?, elementId?, message}`) when the saved layout fails its checks or a print
 *    or spec file is not a PDF, and 409 `DESIGN_FILES_OUTDATED` with `details.roles` when a file is
 *    missing or was drawn from another layout (`simulateOutdatedFiles` makes one for a test);
 *  - a link to an approved design's file answers 409 `CONFLICT` when the stored bytes are gone
 *    (`simulateCorruptFile`), the BE's integrity check.
 */

import { sha256Hex } from "@/features/product-design/engine/export/checksum";
import { vnDateOf } from "@/features/product-design/quote-request-rules";

import {
  BUNDLE_ROLES,
  artifactIdOf,
  asRecord,
  fail,
  fileBlobKey,
  fileKey,
  invalid,
  invalidState,
  notFound,
  ok,
  versionConflict,
  isVersion,
  type BundleRole,
  type DesignRow,
  type FileRow,
  type MockResult,
} from "./design-rows";
import type { StoreContext } from "./design-store-context";
import { askOnSubmit, readAsk, type Ask } from "./design-store-quotes";
import { hashOf, mimeOf, nameOf, withBlobs, type DesignFiles } from "./design-store-files";
import { recheck } from "./design-store-submission";

const HEX_64 = /^[0-9a-f]{64}$/;
const LINK_TTL_MS = 10 * 60_000; // the BE's `presigned-url-ttl`
const FALLBACK_NAMES: Record<BundleRole, string> = {
  CUSTOMER_PREVIEW: "preview.png",
  PRINT_READY: "print-ready.pdf",
  TECHNICAL_SPEC: "technical-spec.pdf",
};

/** The BE's rule name for an engine rule (F-3): only the carton spec is called otherwise. */
const beRule = (ruleId: string) => (ruleId === "NO_CARTON_SPEC" ? "CARTON_SPEC_MISSING" : ruleId);

/** `{rule, surfaceCode?, elementId?, message}`: a finding as the BE lists it, its message in English. */
export const beIssue = (issue: { ruleId: string; surfaceCode?: string; elementId?: string }) => ({
  rule: beRule(issue.ruleId),
  surfaceCode: issue.surfaceCode,
  elementId: issue.elementId,
  message: `The design fails the check ${beRule(issue.ruleId)}`,
});

/** 422 `DESIGN_PREFLIGHT_FAILED`: the BE's refusal of a submission, its findings in `details.issues`. */
export const bePreflightFailed = (issues: ReadonlyArray<ReturnType<typeof beIssue>>) =>
  fail(
    422,
    "DESIGN_PREFLIGHT_FAILED",
    `The design did not pass preflight: ${issues.length} problem(s)`,
    {
      details: { issues: [...issues] },
    },
  );

/** `DesignArtifactResponse` of a file. */
export const artifactDto = (file: FileRow) => ({
  artifactId: artifactIdOf(file),
  designId: file.designId,
  role: file.role,
  originalName: file.name,
  contentType: file.contentType,
  sizeBytes: file.sizeBytes,
  storedAt: file.storedAt,
  checksum: file.sha256,
  documentChecksum: file.documentChecksum,
});

type BeIssue = ReturnType<typeof beIssue>;

/** 409 `DESIGN_FILES_OUTDATED`: a file missing or drawn from another layout, the roles to draw again. */
export const filesOutdated = (roles: readonly BundleRole[]) =>
  fail(409, "DESIGN_FILES_OUTDATED", `Render the files again: ${roles.join(", ")}`, {
    details: { roles: roles.toSorted() },
  });

/**
 * What the BE checks of a draft before it goes to review (`DesignSubmissionService.plan`): the saved
 * layout (variant, carton spec, content, images), then that each file was drawn from that layout,
 * then that the print and spec files are PDFs. Null when it passes; else the findings, or the roles
 * whose files are outdated. A single request for review and a batch both run it.
 */
export async function planOf(
  ctx: StoreContext,
  row: DesignRow,
): Promise<{ issues: BeIssue[] } | { roles: BundleRole[] } | null> {
  const issues = await recheck(ctx, row);
  if (issues.length) return { issues: issues.map(beIssue) };
  const layout = ctx.state().documents[row.id]!.checksum;
  const current = new Map(
    ctx
      .state()
      .files.filter((f) => f.designId === row.id)
      .map((f) => [f.role, f] as const),
  );
  const outdated = BUNDLE_ROLES.filter((role) => current.get(role)?.documentChecksum !== layout);
  if (outdated.length) return { roles: outdated.toSorted() };
  // The press reads the print file, the producer the technical spec: documents, never a picture.
  const notPdf = (["PRINT_READY", "TECHNICAL_SPEC"] as const).filter(
    (role) => current.get(role)!.contentType !== "application/pdf",
  );
  return notPdf.length
    ? { issues: notPdf.map(() => beIssue({ ruleId: "PRINT_FILE_INVALID" })) }
    : null;
}

const isRole = (value: unknown): value is BundleRole =>
  BUNDLE_ROLES.some((kind) => Object.is(kind, value));

export function createArtifactOps(ctx: StoreContext, files: DesignFiles) {
  const filesOf = (designId: string) => ctx.state().files.filter((f) => f.designId === designId);

  return {
    /** POST /designs/{id}/artifacts?role=&documentChecksum= — multipart `file`, `Idempotency-Key`. */
    async upload(
      id: string,
      input: {
        role: unknown;
        file: Blob | undefined;
        documentChecksum?: unknown;
        key?: string | undefined;
      },
    ): Promise<MockResult> {
      const row = ctx.find(id);
      if (!row) return notFound();
      const role = input.role ?? "CUSTOMER_PREVIEW";
      const state = ctx.state();
      // A key finds the artifact it made among all the design's, before the draft is required.
      const uploadKey = input.key?.trim() ? `${String(role)}:${input.key.trim()}` : undefined;
      const earlier = uploadKey
        ? state.artifactUploads.find((u) => u.designId === id && u.key === uploadKey)
        : undefined;
      if (!earlier && row.status !== "DRAFT") return invalidState();
      if (!isRole(role)) return invalid("role", "role must be one of the files a customer sends");
      const documentChecksum = input.documentChecksum;
      if (
        documentChecksum !== undefined &&
        !(typeof documentChecksum === "string" && HEX_64.test(documentChecksum))
      ) {
        return invalid("documentChecksum", "documentChecksum must be a SHA-256 in lower-case hex");
      }
      if (!input.file) return invalid("file", "The file part is required");
      const sha256 = await hashOf(input.file);

      if (earlier) {
        // The BE: a repeat must name the same layout, and the same file. Nothing is attached.
        return earlier.file.sha256 === sha256 && earlier.file.documentChecksum === documentChecksum
          ? ok(artifactDto(earlier.file), 201)
          : fail(422, "IDEMPOTENCY_KEY_REUSED", "This key was already used for another file");
      }

      const file: FileRow = {
        designId: id,
        role,
        name: nameOf(input.file, FALLBACK_NAMES[role]),
        contentType: mimeOf(input.file),
        sizeBytes: input.file.size,
        sha256,
        storedAt: ctx.stamp(),
        key: fileKey(id, role, row.version + 1),
        artifactId: ctx.newId(),
        ...(documentChecksum ? { documentChecksum } : {}),
        ...(uploadKey ? { uploadKey } : {}),
      };
      const replaced = filesOf(id).find((f) => Object.is(f.role, role));
      await withBlobs(ctx, async (put) => {
        await put(fileBlobKey(file), input.file!);
        state.files = [...state.files.filter((f) => f !== replaced), file];
        if (uploadKey)
          state.artifactUploads.push({ designId: id, key: uploadKey, file: { ...file } });
        ctx.touch(row); // an upload moves the design's version on (BE contract §1)
        await ctx.persist();
      });
      if (replaced && fileBlobKey(replaced) !== fileBlobKey(file)) {
        await ctx.discardBlobs([fileBlobKey(replaced)]);
      }
      return ok(artifactDto(file), 201);
    },

    /** GET /designs/{id}/artifacts — every file, newest first. */
    async list(id: string): Promise<MockResult> {
      if (!ctx.find(id)) return notFound();
      const files = filesOf(id).toSorted((a, b) => b.storedAt.localeCompare(a.storedAt));
      return ok(files.map(artifactDto));
    },

    /** GET /designs/{id}/artifacts/{artifactId}/download-url — `{ url, expiresAt }`. */
    async link(id: string, artifactId: string): Promise<MockResult> {
      const row = ctx.find(id);
      if (!row) return notFound();
      const file = filesOf(id).find((f) => artifactIdOf(f) === artifactId);
      if (!file) return notFound();
      const url = await ctx.link(fileBlobKey(file), file.sha256, file.url);
      if (!url) {
        // The BE hands an approved file out only while it is what was approved (BR-10).
        return row.status === "APPROVED"
          ? fail(409, "CONFLICT", "Design integrity verification failed")
          : notFound();
      }
      return ok({ url, expiresAt: new Date(ctx.now().getTime() + LINK_TTL_MS).toISOString() });
    },

    /**
     * POST /designs/{id}/technical-review-requests `{ version }` — DRAFT → PENDING_REVIEW after the
     * BE's own checks of the saved layout and of the files it was drawn into.
     */
    async requestReview(id: string, body: unknown): Promise<MockResult> {
      const row = ctx.find(id);
      if (!row) return notFound();
      const { version, quoteRequest } = asRecord(body);
      if (!isVersion(version)) return invalid("version", "version must be a whole number ≥ 0");
      // Version first, as the BE (`DesignWorkflow`): a stale tab meets CONFLICT.
      if (row.version !== version) return versionConflict();
      if (row.status !== "DRAFT") return invalidState();
      // "Gửi duyệt và yêu cầu báo giá" (A-2): the request is checked before the preflight, so a
      // request that could not be asked refuses the whole submission.
      let quote: Ask | null = null;
      if (quoteRequest !== undefined && quoteRequest !== null) {
        const read = readAsk(quoteRequest, vnDateOf(ctx.now()), "quoteRequest.");
        if ("refused" in read) return read.refused;
        quote = read.ask;
      }

      const refuse = async (found: Array<ReturnType<typeof beIssue>>) => {
        // On the record, the design and its version untouched (the studio must not record it again).
        ctx.record(row, "PREFLIGHT_FAILED", found.map((i) => i.rule).join(", "), row.version);
        await ctx.persist();
        return bePreflightFailed(found);
      };
      const plan = await planOf(ctx, row);
      if (plan && "issues" in plan) return refuse(plan.issues);
      if (plan) return filesOutdated(plan.roles);

      row.status = "PENDING_REVIEW";
      ctx.advance(row, "SUBMITTED_FOR_REVIEW", null);
      row.submittedAt = row.updatedAt;
      // Opened only once the design is sent; one still open from a return is changed (B40).
      const tellChat = quote ? askOnSubmit(ctx, row, quote) : null;
      await ctx.persist();
      tellChat?.();
      return ok(await files.toDto(row));
    },

    /** GET /designs/{id}/snapshot — the design and, for the BE's snapshot, its files. */
    async snapshot(id: string): Promise<MockResult> {
      const row = ctx.find(id);
      if (!row) return notFound();
      return ok({ ...(await files.toDto(row)), artifacts: filesOf(id).map(artifactDto) });
    },

    /** Mock only: the files of `roles` read as drawn from another layout (a template edited since). */
    async simulateOutdatedFiles(id: string, kinds: readonly BundleRole[]): Promise<MockResult> {
      if (!ctx.find(id)) return notFound();
      const stale = await sha256Hex(new TextEncoder().encode("another layout"));
      for (const file of filesOf(id)) {
        if (kinds.includes(file.role)) file.documentChecksum = stale;
      }
      await ctx.persist();
      return ok(null);
    },

    /** Mock only: the stored bytes of a design's file are lost, so its link fails the integrity check. */
    async simulateCorruptFile(id: string, role: BundleRole): Promise<MockResult> {
      const file = filesOf(id).find((f) => Object.is(f.role, role));
      if (!file) return notFound();
      await ctx.discardBlobs([fileBlobKey(file)]);
      return ok(null);
    },
  };
}
