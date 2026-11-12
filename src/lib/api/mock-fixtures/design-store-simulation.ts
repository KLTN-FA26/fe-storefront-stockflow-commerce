/**
 * The reviewer simulation of the design mock (spec 2026-11-09 §4.3, §6.5): mock-only routes that
 * stand in for the Sales Manager, approving or returning a design under review. Each runs as an
 * operation of `design-store.ts`; `reset` stays there, as it reads nothing first.
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
  invalidState,
  notFound,
  ok,
  type MockResult,
} from "./design-rows";
import type { StoreContext } from "./design-store-context";
import type { DesignFiles } from "./design-store-files";

export function createSimulationOps(ctx: StoreContext, files: DesignFiles) {
  return {
    /**
     * Mock-only POST /__mock/designs/{id}/approve — PENDING_REVIEW → APPROVED: the submitted bundle
     * and the document are frozen under a snapshot id and a checksum, and a customer SKU code is
     * made (docs 12 §4.5, BR-08, BR-09).
     */
    async simulateApprove(id: string): Promise<MockResult> {
      const row = ctx.find(id);
      if (!row) return notFound();
      if (row.status !== "PENDING_REVIEW") return invalidState();
      const state = ctx.state();
      const bundle = state.files.filter((file) => file.designId === id);
      if (bundle.length !== BUNDLE_ROLES.length) {
        return fail(409, "INVALID_STATE", "The submitted bundle is incomplete");
      }
      const checksum = await bundleChecksum(bundle, state.documents[id]!.checksum);
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
      await ctx.persist();
      return ok(await files.toDto(row));
    },
  };
}
