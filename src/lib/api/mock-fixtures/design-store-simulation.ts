/**
 * The reviewer simulation of the design mock (spec 2026-11-09 §4.3, §6.5): mock-only routes that
 * stand in for the reviewer (Production Coordinator), approving or returning a design under review. Each runs as an
 * operation of `design-store.ts`; `reset` stays there, as it reads nothing first.
 *
 * A design of an open review round (part E) is decided by the same operations, with the
 * same checks. After each decision the round is looked at: once every design of it has a decision
 * (approved, or returned to DRAFT), it closes and the project records `BATCH_CLOSED` with each
 * design's result (docs 12 §5.4). "Duyệt tất cả" approves the round's pending designs one by one;
 * a design whose approval fails stays pending and does not block the others (BR-20). A design can
 * be switched so that its next approval fails (Q5), the switch clearing with that failure or
 * when the design is returned.
 */

import {
  BUNDLE_ROLES,
  REASON_MAX,
  approvalNote,
  asRecord,
  boundedText,
  bundleChecksum,
  customerSkuCode,
  fail,
  invalid,
  invalidState,
  notFound,
  ok,
  type DesignRow,
  type MockResult,
} from "./design-rows";
import type { StoreContext } from "./design-store-context";
import type { DesignFiles } from "./design-store-files";

/** What a failed approval says: the export of the approved snapshot failed (BR-09). */
const APPROVAL_FAILURE =
  "Không xuất được bộ tệp đã duyệt (sai mã kiểm tra). Bản vẫn đang chờ duyệt.";

export function createSimulationOps(ctx: StoreContext, files: DesignFiles) {
  const designOf = (id: string) => ctx.state().designs.find((design) => design.id === id);
  const openRounds = () => ctx.state().reviewRounds.filter((round) => round.closedAt === null);

  /** Closes the open rounds with no design left waiting, recording `BATCH_CLOSED` (docs 12 §5.4). */
  function closeDecided(): void {
    for (const round of openRounds()) {
      if (round.designIds.some((id) => ctx.waitsIn(round, designOf(id)))) continue;
      // Each design's decision in this round, taken from its history at the time it was made: a
      // design decided again later, in another round, does not change what this round decided.
      const results = round.designIds
        .map((id) => {
          const decision = ctx.decisionIn(round, id);
          if (decision?.type === "APPROVED") return `${id} APPROVED`;
          return decision?.note ? `${id} RETURNED (${decision.note})` : `${id} RETURNED`;
        })
        .join(", ");
      const closedAt = ctx.stamp();
      round.closedAt = closedAt;
      // The uploads the round took only served a lost answer replayed; the designs keep the
      // files (the blobs are theirs now), so only the rows go.
      const state = ctx.state();
      state.submissionUploads = state.submissionUploads.filter((up) => up.roundId !== round.id);
      const project = ctx.state().projects.find((row) => row.id === round.projectId);
      if (project) ctx.recordProject(project, "BATCH_CLOSED", `${round.id}: ${results}`, closedAt);
    }
  }

  /** The approval of one pending design: null when done, else why it failed (the design stays). */
  async function approveRow(row: DesignRow): Promise<string | null> {
    const state = ctx.state();
    if (state.failNextApproval.includes(row.id)) {
      state.failNextApproval = state.failNextApproval.filter((id) => id !== row.id);
      return APPROVAL_FAILURE;
    }
    const bundle = state.files.filter((file) => file.designId === row.id);
    if (bundle.length !== BUNDLE_ROLES.length)
      return "Bộ tệp đã nộp chưa đủ. Bản vẫn đang chờ duyệt.";
    const checksum = await bundleChecksum(bundle, state.documents[row.id]!.checksum);
    const approvedOfSku = state.designs.filter(
      (d) => d.approval && d.variant.sku === row.variant.sku,
    ).length;
    const approval = {
      snapshotId: ctx.newId(),
      skuCode: customerSkuCode(row.variant.sku, approvedOfSku + 1),
      bundleChecksum: checksum,
    };
    row.status = "APPROVED";
    row.approval = approval;
    ctx.advance(row, "APPROVED", approvalNote(approval));
    row.approvedAt = row.updatedAt;
    return null;
  }

  return {
    /**
     * Mock-only POST /__mock/designs/{id}/approve — PENDING_REVIEW → APPROVED: the submitted bundle
     * and the document are frozen under a snapshot id and a checksum, and a customer SKU code is
     * made (docs 12 §4.5, BR-08, BR-09). A design switched to fail (Q5) is refused once, 409.
     */
    async simulateApprove(id: string): Promise<MockResult> {
      const row = ctx.find(id);
      if (!row) return notFound();
      if (row.status !== "PENDING_REVIEW") return invalidState();
      const failure = await approveRow(row);
      if (failure !== null) {
        await ctx.persist(); // a spent switch is saved
        return fail(409, "APPROVAL_FAILED", failure);
      }
      closeDecided();
      await ctx.persist();
      return ok(await files.toDto(row));
    },

    /** Mock-only POST /__mock/designs/{id}/return `{ reason }` — PENDING_REVIEW → DRAFT (BR-06). */
    async simulateReturn(id: string, body: unknown): Promise<MockResult> {
      const row = ctx.find(id);
      if (!row) return notFound();
      const reason = boundedText("reason", asRecord(body).reason, REASON_MAX);
      if ("refused" in reason) return reason.refused;
      if (row.status !== "PENDING_REVIEW") return invalidState();
      row.status = "DRAFT";
      ctx.advance(row, "RETURNED", reason.text);
      row.lastReturn = { reason: reason.text, returnedAt: row.updatedAt };
      // A switch is for the approval of a design waiting in a round: a returned design has none.
      const state = ctx.state();
      state.failNextApproval = state.failNextApproval.filter((designId) => designId !== id);
      closeDecided();
      await ctx.persist();
      return ok(await files.toDto(row));
    },

    /**
     * Mock-only POST /__mock/design-rounds/{id}/approve-all — "Duyệt tất cả": the round's pending
     * designs are approved one by one; one that fails stays PENDING_REVIEW and the rest go on
     * (BR-20). Answers who was approved and who failed, and whether the round closed.
     */
    async simulateApproveRound(roundId: string): Promise<MockResult> {
      const round = ctx.state().reviewRounds.find((row) => row.id === roundId);
      if (!round) return fail(404, "NOT_FOUND", "Review round not found");
      if (round.closedAt !== null) return invalidState();
      const approved: string[] = [];
      const failed: Array<{ designId: string; reason: string }> = [];
      for (const id of round.designIds) {
        const row = designOf(id);
        if (!row || !ctx.waitsIn(round, row)) continue;
        const reason = await approveRow(row);
        if (reason === null) approved.push(id);
        else failed.push({ designId: id, reason });
      }
      closeDecided();
      await ctx.persist();
      return ok({ roundId, approved, failed, closed: round.closedAt !== null });
    },

    /**
     * Mock-only POST /__mock/designs/{id}/fail-next-approval `{ enabled }` — the design's next
     * approval fails once (Q5), then the switch clears.
     */
    async simulateFailNextApproval(id: string, body: unknown): Promise<MockResult> {
      const row = ctx.find(id);
      if (!row) return notFound();
      const { enabled } = asRecord(body);
      if (typeof enabled !== "boolean") return invalid("enabled", "enabled must be true or false");
      // Only a design waiting for review has an approval to fail: anything else would keep the
      // switch for a round it was not asked for (turning it off is always allowed).
      if (enabled && row.status !== "PENDING_REVIEW") return invalidState();
      const state = ctx.state();
      state.failNextApproval = state.failNextApproval.filter((designId) => designId !== id);
      if (enabled) state.failNextApproval.push(id);
      await ctx.persist();
      return ok({ designId: id, failNext: enabled });
    },

    /** Mock-only GET /__mock/design-rounds — the open rounds, each with its designs (the panel). */
    async simulateRounds(): Promise<MockResult> {
      const state = ctx.state();
      const rounds = openRounds().map((round) => ({
        id: round.id,
        projectId: round.projectId,
        projectName: state.projects.find((project) => project.id === round.projectId)?.name ?? "",
        openedAt: round.openedAt,
        designs: round.designIds.flatMap((id) => {
          const design = designOf(id);
          if (!design) return [];
          return [
            {
              id,
              name: design.name,
              status: design.status,
              waiting: ctx.waitsIn(round, design),
              failNext: state.failNextApproval.includes(id),
            },
          ];
        }),
      }));
      return ok({ rounds });
    },
  };
}
