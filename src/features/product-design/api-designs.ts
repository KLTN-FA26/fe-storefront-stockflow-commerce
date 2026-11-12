import { z } from "zod";

import { api } from "@/lib/api/client";

import { designPath, withSignal } from "./api-request";
import {
  createDesignInputSchema,
  designDtoSchema,
  designEventDtoSchema,
  designPageDtoSchema,
  draftCountDtoSchema,
  renameDesignInputSchema,
} from "./schemas";
import type {
  CreateDesignInput,
  DeleteDesignInput,
  Design,
  DesignEvent,
  DesignListParams,
  DesignPage,
  DraftCount,
  RenameDesignInput,
} from "./types";

// The designs themselves and their list (spec 2026-11-09 §4.2); re-exported by `api.ts`.

const to0Based = (page: number) => Math.max(page, 1) - 1; // the wire is 0-based

/** GET /designs?status=&page=&size= — the caller's designs, newest updated first. */
export async function listDesigns(p: DesignListParams, signal?: AbortSignal): Promise<DesignPage> {
  const { data } = await api.get<unknown>("/designs", {
    params: { page: to0Based(p.page), size: p.size, ...(p.status ? { status: p.status } : {}) },
    ...withSignal(signal),
  });
  const page = designPageDtoSchema.parse(data);
  return { ...page, page: page.page + 1 };
}

/** GET /designs/draft-count — `{ drafts, limit }` (docs 12 §4.1, B37). */
export async function getDraftCount(signal?: AbortSignal): Promise<DraftCount> {
  const { data } = await api.get<unknown>("/designs/draft-count", withSignal(signal));
  return draftCountDtoSchema.parse(data);
}

/** POST /designs — a DRAFT from a variant with a print configuration. */
export async function createDesign(input: CreateDesignInput): Promise<Design> {
  const { data } = await api.post<unknown>("/designs", createDesignInputSchema.parse(input));
  return designDtoSchema.parse(data);
}

/** GET /designs/{id} */
export async function getDesign(id: string, signal?: AbortSignal): Promise<Design> {
  const { data } = await api.get<unknown>(designPath(id), withSignal(signal));
  return designDtoSchema.parse(data);
}

/** PATCH /designs/{id} — a DRAFT only; the rename moves the version on. */
export async function renameDesign(id: string, input: RenameDesignInput): Promise<Design> {
  const { name } = renameDesignInputSchema.parse(input);
  const { data } = await api.patch<unknown>(designPath(id), { name, version: input.version });
  return designDtoSchema.parse(data);
}

/** GET /designs/{id}/history — the events, oldest first (docs 12 §5.3). */
export async function getDesignHistory(id: string, signal?: AbortSignal): Promise<DesignEvent[]> {
  const { data } = await api.get<unknown>(designPath(id, "/history"), withSignal(signal));
  return z.array(designEventDtoSchema).parse(data);
}

/** DELETE /designs/{id} with `{ version }` — DRAFT → ARCHIVED, never restored (docs 12 BR-16). */
export async function deleteDesign(id: string, input: DeleteDesignInput): Promise<Design> {
  const { data } = await api.delete<unknown>(designPath(id), { data: { version: input.version } });
  return designDtoSchema.parse(data);
}

/** POST /designs/{id}/revisions — a new DRAFT from an APPROVED design's snapshot (docs 12 BR-12). */
export async function createRevision(id: string): Promise<Design> {
  const { data } = await api.post<unknown>(designPath(id, "/revisions"));
  return designDtoSchema.parse(data);
}
