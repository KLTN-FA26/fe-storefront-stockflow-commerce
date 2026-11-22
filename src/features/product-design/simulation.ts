import { z } from "zod";

import { api } from "@/lib/api/client";

import type { ReturnReasonInput } from "./types";

// The reviewer simulation of spec 2026-11-09 §4.3: the reviewer's (Production Coordinator's) back-office does not exist
// in this repo, so on the mock these routes stand in for it. This file is the only caller of
// `/__mock/*`, through the app's client; callers invalidate what the answer changes.

const designPath = (id: string, tail: string) => `/__mock/designs/${encodeURIComponent(id)}${tail}`;

/** POST /__mock/designs/{id}/approve — PENDING_REVIEW → APPROVED. */
export async function simulateApprove(id: string): Promise<void> {
  await api.post(designPath(id, "/approve"));
}

/** POST /__mock/designs/{id}/return — PENDING_REVIEW → DRAFT, with the reviewer's reason (BR-06). */
export async function simulateReturn(id: string, input: ReturnReasonInput): Promise<void> {
  await api.post(designPath(id, "/return"), { reason: input.reason });
}

/** POST /__mock/reset — everything cleared, the seed written again. */
export async function resetMockData(): Promise<void> {
  await api.post("/__mock/reset");
}

const mockStorageSchema = z.object({ persistent: z.boolean() });

/** GET /__mock/storage — `persistent` is false when the data lives in memory and a reload loses it. */
export async function getMockStorage(signal?: AbortSignal) {
  const { data } = await api.get<unknown>("/__mock/storage", signal ? { signal } : {});
  return mockStorageSchema.parse(data);
}

/** The query key of the open rounds the panel lists; a decision invalidates it. */
export const MOCK_ROUNDS_KEY = ["design-mock", "rounds"] as const;

const mockRoundsSchema = z.object({
  rounds: z.array(
    z.object({
      id: z.string(),
      projectId: z.string(),
      projectName: z.string(),
      openedAt: z.string(),
      designs: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          status: z.string(),
          /** Waiting for a decision in this round (a design sent again elsewhere is not). */
          waiting: z.boolean(),
          /** The design's next approval will fail (Q5). */
          failNext: z.boolean(),
        }),
      ),
    }),
  ),
});
export type MockRound = z.infer<typeof mockRoundsSchema>["rounds"][number];

const roundReviewSchema = z.object({
  roundId: z.string(),
  approved: z.array(z.string()),
  failed: z.array(z.object({ designId: z.string(), reason: z.string() })),
  closed: z.boolean(),
});
export type MockRoundReview = z.infer<typeof roundReviewSchema>;

/** GET /__mock/design-rounds — the review rounds still open, each with its designs. */
export async function listMockRounds(signal?: AbortSignal) {
  const { data } = await api.get<unknown>("/__mock/design-rounds", signal ? { signal } : {});
  return mockRoundsSchema.parse(data).rounds;
}

/**
 * POST /__mock/design-rounds/{id}/approve-all — "Duyệt tất cả": the round's pending designs are
 * approved one by one; a design whose approval fails stays pending and does not block the others
 * (BR-20). The answer says which were approved and which failed, with the reason.
 */
export async function simulateApproveRound(roundId: string): Promise<MockRoundReview> {
  const { data } = await api.post<unknown>(
    `/__mock/design-rounds/${encodeURIComponent(roundId)}/approve-all`,
  );
  return roundReviewSchema.parse(data);
}

/** POST /__mock/designs/{id}/fail-next-approval — the design's next approval fails once (Q5). */
export async function setApprovalFailure(designId: string, enabled: boolean): Promise<void> {
  await api.post(designPath(designId, "/fail-next-approval"), { enabled });
}
