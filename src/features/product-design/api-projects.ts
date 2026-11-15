import { z } from "zod";

import { api } from "@/lib/api/client";

import { designPath, multipart, to0Based, withSignal } from "./api-request";
import { bundleForm } from "./api-submission";
import {
  designProjectSchema,
  openReviewRoundInputSchema,
  projectCreateInputSchema,
  projectEventDtoSchema,
  projectPageDtoSchema,
  projectUpdateInputSchema,
  reviewRoundSchema,
  setPreflightFailureInputSchema,
  submissionUploadDtoSchema,
} from "./project-schemas";
import { designDtoSchema } from "./schemas";
import type {
  ArchiveProjectInput,
  CreateProjectInput,
  Design,
  DesignProject,
  OpenReviewRoundInput,
  ProjectEvent,
  ProjectListParams,
  ProjectPage,
  ReviewRound,
  SetPreflightFailureInput,
  SubmissionFiles,
  SubmissionUpload,
  UpdateProjectInput,
} from "./types";

// The design projects (spec 2026-11-12 §4); re-exported by `api.ts`.

const projectPath = (id: string, tail = "") => `/design-projects/${encodeURIComponent(id)}${tail}`;
/** GET /design-projects?status=&page=&size= — the caller's projects, newest updated first. */
export async function listProjects(
  p: ProjectListParams,
  signal?: AbortSignal,
): Promise<ProjectPage> {
  const { data } = await api.get<unknown>("/design-projects", {
    params: { page: to0Based(p.page), size: p.size, ...(p.status ? { status: p.status } : {}) },
    ...withSignal(signal),
  });
  const page = projectPageDtoSchema.parse(data);
  return { ...page, page: page.page + 1 };
}

/** GET /design-projects/{id} — a closed project is readable too. */
export async function getProject(id: string, signal?: AbortSignal): Promise<DesignProject> {
  const { data } = await api.get<unknown>(projectPath(id), withSignal(signal));
  return designProjectSchema.parse(data);
}

/** POST /design-projects — an ACTIVE project. */
export async function createProject(input: CreateProjectInput): Promise<DesignProject> {
  const body = projectCreateInputSchema.parse(input);
  const { data } = await api.post<unknown>("/design-projects", body);
  return designProjectSchema.parse(data);
}

/** PATCH /design-projects/{id} — name and/or description; 409 VERSION_CONFLICT on a stale version. */
export async function updateProject(id: string, input: UpdateProjectInput): Promise<DesignProject> {
  const { version, ...fields } = input;
  const body = projectUpdateInputSchema.parse(fields);
  const { data } = await api.patch<unknown>(projectPath(id), { ...body, version });
  return designProjectSchema.parse(data);
}

/** POST /design-projects/{id}/archive — 409 PROJECT_HAS_PENDING while a design is under review. */
export async function archiveProject(
  id: string,
  input: ArchiveProjectInput,
): Promise<DesignProject> {
  const { data } = await api.post<unknown>(projectPath(id, "/archive"), { version: input.version });
  return designProjectSchema.parse(data);
}

/** GET /design-projects/{id}/designs — its designs (not ARCHIVED), newest updated first. */
export async function listProjectDesigns(id: string, signal?: AbortSignal): Promise<Design[]> {
  const { data } = await api.get<unknown>(projectPath(id, "/designs"), withSignal(signal));
  return z.array(designDtoSchema).parse(data);
}

/** POST /design-projects/{id}/designs — puts an existing design in the project (docs 12 BR-17). */
export async function addDesignToProject(id: string, designId: string): Promise<Design> {
  const { data } = await api.post<unknown>(projectPath(id, "/designs"), { designId });
  return designDtoSchema.parse(data);
}

/** DELETE /design-projects/{id}/designs/{designId} — 409 DESIGN_PENDING while it is under review. */
export async function removeDesignFromProject(id: string, designId: string): Promise<Design> {
  const { data } = await api.delete<unknown>(
    projectPath(id, `/designs/${encodeURIComponent(designId)}`),
  );
  return designDtoSchema.parse(data);
}

/** GET /design-projects/{id}/history — the events, oldest first. */
export async function getProjectHistory(id: string, signal?: AbortSignal): Promise<ProjectEvent[]> {
  const { data } = await api.get<unknown>(projectPath(id, "/history"), withSignal(signal));
  return z.array(projectEventDtoSchema).parse(data);
}

/**
 * POST /designs/{id}/submission-uploads — one design's three files for a set (spec §8), kept by
 * the server with the design's version until a round takes them (24 hours at most, A-E4). The
 * same `idempotencyKey` with the same files answers the same token: a retry stores nothing twice.
 */
export async function uploadSubmission(
  designId: string,
  files: SubmissionFiles,
  idempotencyKey: string,
): Promise<SubmissionUpload> {
  const { body, checksums } = await bundleForm(files);
  const { data } = await api.post<unknown>(
    designPath(designId, "/submission-uploads"),
    body,
    multipart({ "Idempotency-Key": idempotencyKey }),
  );
  const { uploadToken } = submissionUploadDtoSchema.parse(data);
  return { uploadToken, checksums };
}

/**
 * POST /design-projects/{id}/review-rounds — opens one round over the uploaded designs, all or
 * nothing (docs 12 BR-19): every design goes to PENDING_REVIEW, or none does and the refusal names
 * the designs in the way (`roundRefusalOf`).
 */
export async function openReviewRound(
  projectId: string,
  input: OpenReviewRoundInput,
): Promise<ReviewRound> {
  const body = openReviewRoundInputSchema.parse(input);
  const { data } = await api.post<unknown>(projectPath(projectId, "/review-rounds"), body);
  return reviewRoundSchema.parse(data);
}

/**
 * POST /design-projects/{id}/preflight-failures — the check of a set found a Fail: the project's
 * history records it with each design's issues (docs 12 §5.4 BATCH_PREFLIGHT_FAILED). No design
 * changes; each records its own failure (`recordPreflightFailure`).
 */
export async function recordSetPreflightFailure(
  projectId: string,
  input: SetPreflightFailureInput,
): Promise<ProjectEvent> {
  const body = setPreflightFailureInputSchema.parse(input);
  const { data } = await api.post<unknown>(projectPath(projectId, "/preflight-failures"), body);
  return projectEventDtoSchema.parse(data);
}
