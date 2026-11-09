import { z } from "zod";

import { api } from "@/lib/api/client";

import type { ReturnReasonInput } from "./types";

// The reviewer simulation of spec 2026-11-09 §4.3: the Sales Manager's back-office does not exist
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
