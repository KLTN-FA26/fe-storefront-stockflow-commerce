/**
 * "Gửi duyệt cả bộ" in the design mock (part E spec §4, §8; docs 12 §4.10): the browser uploads
 * each design's three files (`submission-uploads`), then opens one review round over them, all or
 * nothing (BR-19). Each operation runs as an operation of `design-store.ts`, over `StoreContext`.
 *
 * Rules:
 *  - an upload belongs to one DRAFT and keeps the design's version of that moment; the same
 *    `Idempotency-Key` with the same files answers the same token and stores nothing more;
 *  - a round takes 2 DRAFT designs or more of an ACTIVE project, each with an upload no round took
 *    yet, made from the version the design has now, and a passing preflight (the browser's, then
 *    the server's own re-check). A refusal names the designs refused (`details.designIds`) and
 *    changes no design; success moves every design to PENDING_REVIEW at the same instant, the
 *    uploaded files then being its latest submission, as after a single submit;
 *  - the project's history records the round (`BATCH_SUBMITTED`, its designs) and every failed
 *    check of a set (`BATCH_PREFLIGHT_FAILED`, each design's issues): a round refused for it, or
 *    the page's own check reported through `…/preflight-failures` (docs 12 §5.4, ruling R-E10);
 *  - the same items sent again once their round is open answer that round (an answer lost on the
 *    way opens no second one);
 *  - uploads no round took are discarded after 24 hours with their files (A-E4), checked each time
 *    the store loads its state.
 */

import {
  BUNDLE_ROLES,
  MIN_SET_SIZE,
  PROJECT_DESIGN_LIMIT,
  UPLOAD_TTL_MS,
  asRecord,
  isVersion,
  versionConflict,
  fail,
  fileBlobKey,
  invalid,
  invalidState,
  issuesNote,
  notFound,
  ok,
  projectArchived,
  projectNotFound,
  toProjectEventDto,
  uploadFileKey,
  type BundleRole,
  type DesignRow,
  type MockResult,
  type ProjectRow,
  type ReviewRoundRow,
  type SubmissionUploadRow,
} from "./design-rows";
import type { StoreContext } from "./design-store-context";
import { bundleRows, readBundle, withBlobs, type BundleForm } from "./design-store-files";
import {
  failuresNote,
  readFailures,
  readRoundItems,
  type DesignFailure,
  type RoundItem,
} from "./design-store-rounds-input";
import { planOf } from "./design-store-artifacts";
import { recheck } from "./design-store-submission";

/** A refusal naming the designs it refuses, so the page can say which one. */
const refusedDesigns = (
  status: number,
  errorCode: string,
  message: string,
  designIds: readonly string[],
  extra: Record<string, unknown> = {},
) => fail(status, errorCode, message, { details: { designIds: [...designIds], ...extra } });

const idsOf = (items: readonly { designId: string }[]) => items.map((item) => item.designId);

/** The upload's files are the ones `sums` names. */
const holds = (upload: SubmissionUploadRow, sums: Readonly<Record<BundleRole, string>>) => {
  const stored = new Map(upload.files.map((file) => [file.role, file.sha256]));
  return BUNDLE_ROLES.every((part) => stored.get(part) === sums[part]);
};

export function createRoundOps(ctx: StoreContext) {
  const uploadOf = (token: string) =>
    ctx.state().submissionUploads.find((upload) => upload.token === token);

  /** The round of `projectId` these very items opened already: each token was taken by it. */
  function openedBy(projectId: string, items: readonly RoundItem[]): ReviewRoundRow | undefined {
    const uploads = items.map((item) => uploadOf(item.uploadToken));
    const roundId = uploads[0]?.roundId;
    if (!roundId) return undefined;
    const round = ctx.state().reviewRounds.find((r) => r.id === roundId);
    const same =
      round?.projectId === projectId &&
      round.designIds.length === items.length &&
      items.every(
        (item, i) =>
          uploads[i]?.roundId === roundId &&
          uploads[i]?.designId === item.designId &&
          round.designIds.includes(item.designId),
      );
    return same ? round : undefined;
  }

  /** The designs of `items` that are not the project's (BR-17); none when all are. */
  const outsideOf = (project: ProjectRow, items: readonly { designId: string }[]) =>
    items.filter((item) => ctx.find(item.designId)?.projectId !== project.id);

  /** BATCH_PREFLIGHT_FAILED: a set did not pass its check, each design's issues noted (§5.4). */
  function recordFailures(project: ProjectRow, failures: readonly DesignFailure[]) {
    return ctx.recordProject(project, "BATCH_PREFLIGHT_FAILED", failuresNote(failures));
  }

  /**
   * The checks a round's designs fail: the browser's Fail, else the server's own (§4.2).
   * `serverCheck` says which: the browser's Fail is recorded on the design by the page itself.
   */
  async function failuresOf(
    items: readonly RoundItem[],
    rows: readonly DesignRow[],
  ): Promise<{ failures: DesignFailure[]; serverCheck: boolean }> {
    const browser = items
      .filter((item) => item.preflight.result === "Fail")
      .map((item) => ({ designId: item.designId, issues: item.preflight.issues }));
    if (browser.length) return { failures: browser, serverCheck: false };
    const rechecked = await Promise.all(rows.map((row) => recheck(ctx, row)));
    const failures = items
      .map((item, i) => ({ designId: item.designId, issues: rechecked[i]! }))
      .filter((failure) => failure.issues.length > 0);
    return { failures, serverCheck: true };
  }

  return {
    /**
     * POST /designs/{id}/submission-uploads (multipart: the three files, `checksums`; header
     * `Idempotency-Key`) → 201 `{ uploadToken }`. The design is not changed.
     */
    async uploadSubmission(id: string, form: BundleForm, key?: string) {
      const row = ctx.find(id);
      if (!row) return notFound();
      const idempotencyKey = key?.trim();
      if (!idempotencyKey) {
        return invalid("Idempotency-Key", "The Idempotency-Key header is required");
      }
      const bundle = await readBundle(form);
      if ("refused" in bundle) return bundle.refused;
      const { hashes } = bundle;

      // A retry after a lost answer: the same key and files answer the first upload again.
      const earlier = ctx
        .state()
        .submissionUploads.find(
          (upload) => upload.designId === id && upload.key === idempotencyKey,
        );
      if (earlier) {
        const sums = Object.fromEntries(BUNDLE_ROLES.map((role, i) => [role, hashes[i]!]));
        return holds(earlier, sums as Record<BundleRole, string>)
          ? ok({ uploadToken: earlier.token }, 201)
          : fail(422, "IDEMPOTENCY_KEY_REUSED", "This key was already used for other files");
      }
      if (row.status !== "DRAFT") return invalidState();

      const token = ctx.newId();
      const uploadedAt = ctx.stamp();
      const upload: SubmissionUploadRow = {
        token,
        designId: id,
        key: idempotencyKey,
        version: row.version,
        files: bundleRows(id, form.files, hashes, uploadedAt, (role) => uploadFileKey(token, role)),
        uploadedAt,
        roundId: null,
      };
      // The bytes, then the row that lists them; should the row not be saved, the bytes go again.
      await withBlobs(ctx, async (put) => {
        for (const file of upload.files) await put(fileBlobKey(file), form.files[file.role]!);
        ctx.state().submissionUploads.push(upload);
        await ctx.persist();
      });
      return ok({ uploadToken: token }, 201);
    },

    /**
     * POST /design-projects/{id}/review-rounds `{ items: [{ designId, version, uploadToken,
     * preflight, checksums }] }` → 201 the round (200 when these items opened it already).
     */
    async openRound(projectId: string, body: unknown): Promise<MockResult> {
      const project = ctx.findProject(projectId);
      if (!project) return projectNotFound();
      const read = readRoundItems(body);
      if ("refused" in read) return read.refused;
      const { items } = read;
      const before = openedBy(project.id, items);
      if (before) return ok(structuredClone(before));
      if (project.status !== "ACTIVE") return projectArchived();
      if (items.length < MIN_SET_SIZE) {
        return fail(422, "SET_TOO_SMALL", `A set holds at least ${MIN_SET_SIZE} DRAFT designs`);
      }

      // BR-17, BR-19: the designs of this project, all DRAFT.
      const outside = outsideOf(project, items);
      if (outside.length) {
        const ids = idsOf(outside);
        return refusedDesigns(422, "DESIGN_NOT_IN_PROJECT", "Not a design of this project", ids);
      }
      const rows = items.map((item) => ctx.find(item.designId)!);
      const notDraft = items.filter((_, i) => rows[i]!.status !== "DRAFT");
      if (notDraft.length) {
        const ids = idsOf(notDraft);
        return refusedDesigns(422, "DESIGN_NOT_DRAFT", "Only DRAFT designs are sent", ids);
      }
      // Each design's own upload, not taken yet, holding the files the item names.
      const uploads = items.map((item) => uploadOf(item.uploadToken));
      const unusable = items.filter((item, i) => {
        const upload = uploads[i];
        return (
          !upload ||
          upload.designId !== item.designId ||
          upload.roundId !== null ||
          !holds(upload, item.checksums)
        );
      });
      if (unusable.length) {
        const ids = idsOf(unusable);
        return refusedDesigns(422, "UPLOAD_INVALID", "No usable upload for a design", ids);
      }
      const taken = uploads as SubmissionUploadRow[];
      // BR-11: the version sent, and the one the files were made from, is the design's now.
      const changed = items.filter((item, i) => {
        const now = rows[i]!.version;
        return item.version !== now || taken[i]!.version !== now;
      });
      if (changed.length) {
        const ids = idsOf(changed);
        return refusedDesigns(409, "VERSION_CHANGED", "A design changed since its files", ids);
      }
      // BR-05, BR-19: one design failing its preflight sends none; the project's history says so.
      const { failures, serverCheck } = await failuresOf(items, rows);
      if (failures.length) {
        recordFailures(project, failures);
        // The server's own refusal is on the record of each design it refused, as a single
        // submission's is (docs 12 §5.3); the design itself stays as it was.
        if (serverCheck) {
          for (const failure of failures) {
            const row = ctx.find(failure.designId)!;
            ctx.record(row, "PREFLIGHT_FAILED", issuesNote(failure.issues), row.version);
          }
        }
        await ctx.persist();
        const ids = idsOf(failures);
        return refusedDesigns(422, "PREFLIGHT_FAILED", "A design did not pass preflight", ids, {
          failures,
        });
      }

      // Every design at the same instant: PENDING_REVIEW, its uploaded files its latest
      // submission, SUBMITTED_FOR_REVIEW noting the round.
      const at = ctx.stamp();
      const round: ReviewRoundRow = {
        id: ctx.newId(),
        projectId: project.id,
        designIds: idsOf(items),
        openedAt: at,
        closedAt: null,
      };
      const state = ctx.state();
      const inRound = (designId: string) => round.designIds.includes(designId);
      const earlier = state.files.filter((file) => inRound(file.designId)).map(fileBlobKey);
      state.files = [
        ...state.files.filter((file) => !inRound(file.designId)),
        ...taken.flatMap((upload) => upload.files.map((file) => ({ ...file }))),
      ];
      for (const [i, row] of rows.entries()) {
        row.status = "PENDING_REVIEW";
        row.version += 1;
        row.updatedAt = at;
        row.submittedAt = at;
        ctx.record(row, "SUBMITTED_FOR_REVIEW", round.id, row.version, at);
        taken[i]!.roundId = round.id;
      }
      state.reviewRounds.push(round);
      project.updatedAt = at;
      const designs = round.designIds.join(", ");
      ctx.recordProject(project, "BATCH_SUBMITTED", `${round.id}: ${designs}`, at);
      await ctx.persist();
      const listed = new Set(state.files.map(fileBlobKey));
      await ctx.discardBlobs(earlier.filter((key) => !listed.has(key)));
      return ok(structuredClone(round), 201);
    },

    /**
     * POST /design-projects/{id}/review-rounds `{ designs: [{ id, version }] }` (the BE's way): the
     * files are in each design already (`design-store-artifacts.ts`), so one request names the set.
     * 2 to 20 designs of an ACTIVE project, each once, each DRAFT at the version sent, else 409
     * `CONFLICT` / `DESIGN_NOT_DRAFT` with `details.designIds` (BE-4). Each is then planned as a single
     * request for review is; one failing sends none: 422 `DESIGN_BATCH_PREFLIGHT_FAILED` with
     * `details.designs[{designId, issues? | roles?}]`, on the project's history
     * (`BATCH_PREFLIGHT_FAILED`) and, for findings, on each design's. Success moves every design to
     * PENDING_REVIEW at one instant and answers the round (a customer cannot read it again).
     */
    async submitBatch(projectId: string, body: unknown): Promise<MockResult> {
      const project = ctx.findProject(projectId);
      if (!project) return projectNotFound();
      const { designs } = asRecord(body);
      const items = Array.isArray(designs) ? designs.map(asRecord) : [];
      const ids = items.map((item) => item.id);
      if (
        items.length < MIN_SET_SIZE ||
        items.length > PROJECT_DESIGN_LIMIT ||
        ids.some((id) => typeof id !== "string" || !id.trim()) ||
        new Set(ids).size !== ids.length ||
        items.some((item) => !isVersion(item.version))
      ) {
        return invalid(
          "designs",
          `${MIN_SET_SIZE} to ${PROJECT_DESIGN_LIMIT} designs, each once, with a version`,
        );
      }
      if (project.status !== "ACTIVE") return projectArchived();
      const rows = items.map((item) => ctx.find(String(item.id)));
      if (rows.some((row) => !row || row.projectId !== project.id)) return notFound();
      const members = rows as DesignRow[];
      // The BE's planning loop (`DesignBatchSubmissionService.submit`, d47ed4ae, BE-4) goes through
      // every design: version first, as `DesignWorkflow` (a stale tab meets CONFLICT), then the
      // status. The first refusal met sets the code, and `details.designIds` lists every design
      // refused with that same code (one refused with the other code is not listed).
      let refused: MockResult | null = null;
      const refusedIds: string[] = [];
      for (const [i, row] of members.entries()) {
        const refusal =
          row.version !== items[i]!.version
            ? versionConflict()
            : row.status !== "DRAFT"
              ? invalidState()
              : null;
        if (!refusal) continue;
        refused ??= refusal;
        if (asRecord(refusal.data).errorCode === asRecord(refused.data).errorCode) {
          refusedIds.push(row.id);
        }
      }
      if (refused) {
        const { errorCode, message } = asRecord(refused.data);
        return refusedDesigns(refused.status, String(errorCode), String(message), refusedIds);
      }
      const failures: Array<{
        row: DesignRow;
        plan: NonNullable<Awaited<ReturnType<typeof planOf>>>;
      }> = [];
      for (const row of members) {
        const plan = await planOf(ctx, row);
        if (plan) failures.push({ row, plan });
      }
      if (failures.length) {
        const note = failures
          .map(
            ({ row, plan }) =>
              `${row.id}: ${"issues" in plan ? plan.issues.map((i) => i.rule).join(", ") : "files outdated"}`,
          )
          .join(" | ");
        ctx.recordProject(project, "BATCH_PREFLIGHT_FAILED", note);
        for (const { row, plan } of failures) {
          if ("issues" in plan) {
            ctx.record(
              row,
              "PREFLIGHT_FAILED",
              plan.issues.map((i) => i.rule).join(", "),
              row.version,
            );
          }
        }
        await ctx.persist();
        return fail(
          422,
          "DESIGN_BATCH_PREFLIGHT_FAILED",
          "Some designs did not pass; none was submitted",
          {
            details: {
              designs: failures.map(({ row, plan }) => ({ designId: row.id, ...plan })),
            },
          },
        );
      }

      // Every design at the same instant: PENDING_REVIEW, SUBMITTED_FOR_REVIEW noting the round.
      const at = ctx.stamp();
      const round: ReviewRoundRow = {
        id: ctx.newId(),
        projectId: project.id,
        designIds: members.map((row) => row.id),
        openedAt: at,
        closedAt: null,
      };
      for (const row of members) {
        row.status = "PENDING_REVIEW";
        row.version += 1;
        row.updatedAt = at;
        row.submittedAt = at;
        ctx.record(row, "SUBMITTED_FOR_REVIEW", round.id, row.version, at);
      }
      ctx.state().reviewRounds.push(round);
      project.updatedAt = at;
      ctx.recordProject(
        project,
        "BATCH_SUBMITTED",
        `${round.id}: ${round.designIds.join(", ")}`,
        at,
      );
      await ctx.persist();
      return ok({ roundId: round.id, designIds: round.designIds }, 201);
    },

    /**
     * POST /design-projects/{id}/preflight-failures `{ items: [{ designId, issues }] }` → 201 the
     * BATCH_PREFLIGHT_FAILED event: the page's own check of a set found a Fail (ruling R-E10). No
     * design changes; each design records its own PREFLIGHT_FAILED (`…/designs/{id}/…`).
     */
    async recordFailures(projectId: string, body: unknown): Promise<MockResult> {
      const project = ctx.findProject(projectId);
      if (!project) return projectNotFound();
      const read = readFailures(body);
      if ("refused" in read) return read.refused;
      if (project.status !== "ACTIVE") return projectArchived();
      const outside = outsideOf(project, read.items);
      if (outside.length) {
        const ids = idsOf(outside);
        return refusedDesigns(422, "DESIGN_NOT_IN_PROJECT", "Not a design of this project", ids);
      }
      const event = recordFailures(project, read.items);
      await ctx.persist();
      return ok(toProjectEventDto(event), 201);
    },

    /**
     * ASSUMPTION (A-E4): uploads no round took within 24 hours go, with their files. Run as the
     * store loads its state; it does nothing (not even read the clock) while none waits.
     */
    async sweep(): Promise<void> {
      const state = ctx.state();
      if (!state.submissionUploads.some((upload) => upload.roundId === null)) return;
      const cutoff = ctx.now().getTime() - UPLOAD_TTL_MS;
      const stale = state.submissionUploads.filter(
        (upload) => upload.roundId === null && Date.parse(upload.uploadedAt) < cutoff,
      );
      if (!stale.length) return;
      state.submissionUploads = state.submissionUploads.filter((upload) => !stale.includes(upload));
      await ctx.persist();
      await ctx.discardBlobs(stale.flatMap((upload) => upload.files.map(fileBlobKey)));
    },
  };
}
