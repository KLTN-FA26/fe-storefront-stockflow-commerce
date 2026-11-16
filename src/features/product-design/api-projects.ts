import { api } from "@/lib/api/client";

import { to0Based, withSignal } from "./api-request";
import {
  batchSubmittedDtoSchema,
  projectDtoSchema,
  projectEventDtoSchema,
  projectEventPageDtoSchema,
  projectSummaryPageDtoSchema,
  type ProjectEventDto,
} from "./project-dtos";
import { toProject, toProjectEvent, toProjectSummary } from "./project-mappers";
import {
  openReviewRoundInputSchema,
  projectCreateInputSchema,
  projectUpdateInputSchema,
  setPreflightFailureInputSchema,
} from "./project-schemas";
import { beRuleOf } from "./preflight-messages";
import type {
  ArchiveProjectInput,
  CreateProjectInput,
  DesignProject,
  OpenReviewRoundInput,
  ProjectEvent,
  ProjectListParams,
  ProjectPage,
  ReviewRound,
  SetPreflightFailureInput,
  UpdateProjectInput,
} from "./types";

// The design projects against the BE's API (`DesignProjectController`); re-exported by `api.ts`.
// The shapes are the BE's (`project-dtos.ts`), turned into the screens' by `project-mappers.ts`.

const projectPath = (id: string, tail = "") => `/design-projects/${encodeURIComponent(id)}${tail}`;

/** The BE's page size limit: more is a 400, never a short page. */
const MAX_PAGE_SIZE = 200;
/** A history is a few dozen rows; this only stops a runaway loop. */
const MAX_HISTORY_PAGES = 25;
/** The BE takes 1 to 20 designs, each with 1 to 50 findings, of the studio's own preflight. */
const MAX_REPORTED_DESIGNS = 20;
const MAX_REPORTED_ISSUES = 50;

/**
 * GET /design-projects?status=&page=&size= — the caller's projects, newest created first. A row has
 * no previews, no round and no `updatedAt` (F-26, F-28): a card reads its project's detail for the
 * previews when it shows (`useProject`), one read each, cached.
 */
export async function listProjects(
  p: ProjectListParams,
  signal?: AbortSignal,
): Promise<ProjectPage> {
  const { data } = await api.get<unknown>("/design-projects", {
    params: { page: to0Based(p.page), size: p.size, ...(p.status ? { status: p.status } : {}) },
    ...withSignal(signal),
  });
  const page = projectSummaryPageDtoSchema.parse(data);
  return { ...page, items: page.items.map(toProjectSummary), page: page.page + 1 };
}

/**
 * GET /design-projects/{id} — a closed project is readable too. Its designs come with it (F-30),
 * not ARCHIVED, each with its preview.
 */
export async function getProject(id: string, signal?: AbortSignal): Promise<DesignProject> {
  const { data } = await api.get<unknown>(projectPath(id), withSignal(signal));
  return toProject(projectDtoSchema.parse(data));
}

/** POST /design-projects — an ACTIVE project (201). */
export async function createProject(input: CreateProjectInput): Promise<DesignProject> {
  const body = projectCreateInputSchema.parse(input);
  const { data } = await api.post<unknown>("/design-projects", body);
  return toProject(projectDtoSchema.parse(data));
}

/**
 * PUT /design-projects/{id} `{ version, name, description? }` — the BE takes the name every time
 * (F-29); 409 `CONFLICT` on a stale version.
 */
export async function updateProject(id: string, input: UpdateProjectInput): Promise<DesignProject> {
  const { version, ...fields } = input;
  const body = projectUpdateInputSchema.parse(fields);
  const { data } = await api.put<unknown>(projectPath(id), { ...body, version });
  return toProject(projectDtoSchema.parse(data));
}

/** POST /design-projects/{id}/archive — 409 `DESIGN_PROJECT_HAS_PENDING` while a design is under review. */
export async function archiveProject(
  id: string,
  input: ArchiveProjectInput,
): Promise<DesignProject> {
  const { data } = await api.post<unknown>(projectPath(id, "/archive"), { version: input.version });
  return toProject(projectDtoSchema.parse(data));
}

/**
 * POST /design-projects/{id}/designs `{ designId }` — puts an existing design in the project (docs
 * 12 BR-17). The BE answers the project (F-31); 409 `DESIGN_IN_ANOTHER_PROJECT`,
 * `DESIGN_PROJECT_FULL`, `DESIGN_PROJECT_ARCHIVED`, and an archived design is a 404.
 */
export async function addDesignToProject(id: string, designId: string): Promise<DesignProject> {
  const { data } = await api.post<unknown>(projectPath(id, "/designs"), { designId });
  return toProject(projectDtoSchema.parse(data));
}

/** DELETE /design-projects/{id}/designs/{designId} — answers the project (F-31); 409 `DESIGN_PENDING_IN_PROJECT` while under review. */
export async function removeDesignFromProject(
  id: string,
  designId: string,
): Promise<DesignProject> {
  const { data } = await api.delete<unknown>(
    projectPath(id, `/designs/${encodeURIComponent(designId)}`),
  );
  return toProject(projectDtoSchema.parse(data));
}

/**
 * GET /design-projects/{id}/history — every event, oldest first (F-16). The BE pages it newest
 * first (size ≤ 200): all pages are read and the order reversed.
 */
export async function getProjectHistory(id: string, signal?: AbortSignal): Promise<ProjectEvent[]> {
  const rows: ProjectEventDto[] = [];
  for (let page = 0; page < MAX_HISTORY_PAGES; page += 1) {
    const { data } = await api.get<unknown>(projectPath(id, "/history"), {
      params: { page, size: MAX_PAGE_SIZE },
      ...withSignal(signal),
    });
    const answer = projectEventPageDtoSchema.parse(data);
    rows.push(...answer.items);
    if (!answer.hasNext) break;
  }
  return rows.toReversed().map(toProjectEvent);
}

/**
 * POST /design-projects/{id}/review-rounds `{ designs: [{ id, version }] }` — one round over 2 to
 * 20 DRAFT designs whose files are uploaded, all or nothing (docs 12 BR-19, F-32): 201 `{ roundId,
 * project }`. A refusal is 422 `DESIGN_BATCH_PREFLIGHT_FAILED` naming each design's findings or
 * outdated roles (`batchRefusalOf`), or a plain 409 `CONFLICT` / `DESIGN_NOT_DRAFT` that names none.
 */
export async function openReviewRound(
  projectId: string,
  input: OpenReviewRoundInput,
): Promise<ReviewRound> {
  const body = openReviewRoundInputSchema.parse(input);
  const { data } = await api.post<unknown>(projectPath(projectId, "/review-rounds"), body);
  const answer = batchSubmittedDtoSchema.parse(data);
  return { roundId: answer.roundId, project: toProject(answer.project) };
}

/**
 * POST /design-projects/{id}/preflight-failures — the page's own check of a set found a Fail: the
 * project's history records it (docs 12 §5.4 BATCH_PREFLIGHT_FAILED). Findings by `rule`, the BE
 * ignores a `message` (none is sent); 1 to 20 designs, each 1 to 50. No design changes; each
 * records its own failure (`recordPreflightFailure`).
 */
export async function recordSetPreflightFailure(
  projectId: string,
  input: SetPreflightFailureInput,
): Promise<ProjectEvent> {
  const { items } = setPreflightFailureInputSchema.parse(input);
  const body = {
    items: items.slice(0, MAX_REPORTED_DESIGNS).map(({ designId, issues }) => ({
      designId,
      issues: issues.slice(0, MAX_REPORTED_ISSUES).map((issue) => ({
        rule: beRuleOf(issue.ruleId),
        ...(issue.surfaceCode ? { surfaceCode: issue.surfaceCode } : {}),
        ...(issue.elementId ? { elementId: issue.elementId } : {}),
      })),
    })),
  };
  const { data } = await api.post<unknown>(projectPath(projectId, "/preflight-failures"), body);
  return toProjectEvent(projectEventDtoSchema.parse(data));
}
