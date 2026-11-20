import { api } from "@/lib/api/client";

import { readCustomization, templateOfSku } from "./api-print-config";
import { designPath, to0Based, withSignal } from "./api-request";
import {
  designDecisionPageDtoSchema,
  designDraftDtoSchema,
  designDraftPageDtoSchema,
  projectRefDtoSchema,
  projectRefPageDtoSchema,
  type DesignDecisionDto,
  type DesignDraftDto,
  type ProjectRefDto,
} from "./design-dtos";
import { cloneDtoSchema } from "./project-dtos";
import { DRAFT_LIMIT, toDesign, toDesignEvent } from "./design-mappers";
import {
  cloneDesignInputSchema,
  notInProjectReasonSchema,
  createDesignInputSchema,
  renameDesignInputSchema,
} from "./schemas";
import type {
  CloneDesignInput,
  CloneResult,
  CreateDesignInput,
  DeleteDesignInput,
  Design,
  DesignEvent,
  DesignListParams,
  DesignPage,
  DraftCount,
  RenameDesignInput,
} from "./types";

// The designs themselves and their list, against the BE's design API (/api/v1/designs, docs
// `design-studio-fe-contract.md` §3); re-exported by `api.ts`. Each answer is parsed once as a DTO
// (`design-dtos.ts`), then mapped to the domain `Design` (`design-mappers.ts`).

/** The BE's page size limit: more is a 400, never a short page. */
const MAX_PAGE_SIZE = 200;
/** A design's history is a few dozen rows; this only stops a runaway loop. */
const MAX_HISTORY_PAGES = 25;

/**
 * The projects the given designs belong to, by id (F-8): the design carries only `projectId`. One
 * read for one project, one list read (size 200) for several, then one read for any it did not
 * list. A failure is the caller's (`withProjects` shows the designs without their projects).
 */
async function readProjects(
  ids: ReadonlyArray<string | null | undefined>,
  signal?: AbortSignal,
): Promise<Map<string, ProjectRefDto>> {
  const wanted = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  const found = new Map<string, ProjectRefDto>();
  if (wanted.length === 0) return found;
  if (wanted.length > 1) {
    const { data } = await api.get<unknown>("/design-projects", {
      params: { page: 0, size: MAX_PAGE_SIZE },
      ...withSignal(signal),
    });
    for (const project of projectRefPageDtoSchema.parse(data).items) found.set(project.id, project);
  }
  for (const id of wanted.filter((id) => !found.has(id))) {
    const { data } = await api.get<unknown>(`/design-projects/${encodeURIComponent(id)}`, {
      ...withSignal(signal),
    });
    found.set(id, projectRefDtoSchema.parse(data));
  }
  return found;
}

/** Designs from their DTOs, each with its project. */
async function withProjects(
  dtos: readonly DesignDraftDto[],
  signal?: AbortSignal,
): Promise<Design[]> {
  // A project that cannot be read does not hide the design: it loads without it, and the console says why.
  const projects = await readProjects(
    dtos.map((dto) => dto.projectId),
    signal,
  ).catch((error: unknown) => {
    if (signal?.aborted) throw error;
    console.warn(
      "The project of a design could not be read; it is shown without its project.",
      error,
    );
    return new Map<string, ProjectRefDto>();
  });
  return dtos.map((dto) =>
    toDesign(dto, dto.projectId ? (projects.get(dto.projectId) ?? null) : null),
  );
}

/** A design from the BE's `DesignDraftResponse` answer, with its project (F-8). */
export async function designFromAnswer(answer: unknown, signal?: AbortSignal): Promise<Design> {
  const [design] = await withProjects([designDraftDtoSchema.parse(answer)], signal);
  return design!;
}

/** GET /designs?status=&page=&size= — the caller's designs, newest first, never ARCHIVED (BR-16). */
export async function listDesigns(p: DesignListParams, signal?: AbortSignal): Promise<DesignPage> {
  const { data } = await api.get<unknown>("/designs", {
    params: { page: to0Based(p.page), size: p.size, ...(p.status ? { status: p.status } : {}) },
    ...withSignal(signal),
  });
  const page = designDraftPageDtoSchema.parse(data);
  return { ...page, items: await withProjects(page.items, signal), page: page.page + 1 };
}

/**
 * The drafts against the limit (docs 12 §4.1, B37): `totalElements` of a one-row page of DRAFTs, and
 * the fixed limit (F-11). The 409 `DESIGN_DRAFT_LIMIT_REACHED` of a create stays the last word.
 */
export async function getDraftCount(signal?: AbortSignal): Promise<DraftCount> {
  const { data } = await api.get<unknown>("/designs", {
    params: { status: "DRAFT", page: 0, size: 1 },
    ...withSignal(signal),
  });
  return { drafts: designDraftPageDtoSchema.parse(data).totalElements, limit: DRAFT_LIMIT };
}

/**
 * POST /designs/mine — a DRAFT from a variant with a template (docs 12 BR-01, BR-02). The BE wants
 * the product's id and the template's code, which the product's customization read lists by SKU
 * (F-12); a SKU it does not list has no template to design on (404 PRINT_CONFIG_NOT_FOUND).
 */
export async function createDesign(input: CreateDesignInput): Promise<Design> {
  const { productSlug, sku, name, projectId, idempotencyKey } =
    createDesignInputSchema.parse(input);
  const customization = await readCustomization(productSlug, sku);
  const template = templateOfSku(customization, sku);
  const body = {
    productId: customization.productId,
    sku,
    templateCode: template.code,
    name,
    ...(projectId ? { projectId } : {}),
  };
  // Without a key the call is the plain one; with it a repeated create is answered, not repeated.
  const { data } = idempotencyKey
    ? await api.post<unknown>("/designs/mine", body, {
        headers: { "Idempotency-Key": idempotencyKey },
      })
    : await api.post<unknown>("/designs/mine", body);
  return designFromAnswer(data);
}

/** Where a design's project comes from when the caller keeps it (a cache): `{ id, name, status }`. */
export type ProjectLookup = (projectId: string) => Promise<ProjectRefDto>;

/**
 * GET /designs/{id}. Its project is read by `GET /design-projects/{id}` (F-8), unless the caller
 * gives `project`, a lookup that reads it once and keeps it (the design query's, Data M-6): a
 * design re-read every 5 s then does not read its whole project each time.
 */
export async function getDesign(
  id: string,
  signal?: AbortSignal,
  project?: ProjectLookup,
): Promise<Design> {
  const { data } = await api.get<unknown>(designPath(id), withSignal(signal));
  if (!project) return designFromAnswer(data, signal);
  const dto = designDraftDtoSchema.parse(data);
  if (!dto.projectId) return toDesign(dto, null);
  const ref = await project(dto.projectId).catch((error: unknown) => {
    if (signal?.aborted) throw error;
    console.warn(
      "The project of a design could not be read; it is shown without its project.",
      error,
    );
    return null;
  });
  return toDesign(dto, ref);
}

/** PUT /designs/{id}/name — a DRAFT only; the rename moves the version on. */
export async function renameDesign(id: string, input: RenameDesignInput): Promise<Design> {
  const { name } = renameDesignInputSchema.parse(input);
  const { data } = await api.put<unknown>(designPath(id, "/name"), {
    version: input.version,
    name,
  });
  return designFromAnswer(data);
}

/**
 * GET /designs/{id}/history — every event, oldest first (docs 12 §5.3). The BE pages it newest
 * first (size ≤ 200): all pages are read and the order reversed (F-15).
 */
export async function getDesignHistory(id: string, signal?: AbortSignal): Promise<DesignEvent[]> {
  const rows: DesignDecisionDto[] = [];
  for (let page = 0; page < MAX_HISTORY_PAGES; page += 1) {
    const { data } = await api.get<unknown>(designPath(id, "/history"), {
      params: { page, size: MAX_PAGE_SIZE },
      ...withSignal(signal),
    });
    const answer = designDecisionPageDtoSchema.parse(data);
    rows.push(...answer.items);
    if (!answer.hasNext) break;
  }
  return rows.toReversed().map(toDesignEvent);
}

/** POST /designs/{id}/archive `{ version }` — DRAFT → ARCHIVED, never restored (docs 12 BR-16). */
export async function deleteDesign(id: string, input: DeleteDesignInput): Promise<Design> {
  const { data } = await api.post<unknown>(designPath(id, "/archive"), { version: input.version });
  return designFromAnswer(data);
}

/** POST /designs/{id}/revisions — a new DRAFT from an APPROVED design's snapshot (docs 12 BR-12). */
export async function createRevision(id: string): Promise<Design> {
  const { data } = await api.post<unknown>(designPath(id, "/revisions"));
  return designFromAnswer(data);
}

/**
 * POST /designs/{id}/clones `{ variantSku, document }` + `Idempotency-Key` (required) — a new DRAFT
 * for another variant of the same product (201 `{ design, notInProject? }`, the project key left out
 * when null). The BE keeps the source's asset ids and takes the target template from
 * `document.templateCode`, which `retargetDocument` has set to the target's. A target that is not
 * one is 409 `DESIGN_CLONE_TARGET_INVALID`.
 */
export async function cloneDesign(
  id: string,
  input: CloneDesignInput,
  idempotencyKey: string,
): Promise<CloneResult> {
  const body = cloneDesignInputSchema.parse(input);
  const { data } = await api.post<unknown>(designPath(id, "/clones"), body, {
    headers: { "Idempotency-Key": idempotencyKey },
  });
  const answer = cloneDtoSchema.parse(data);
  const reason = notInProjectReasonSchema.safeParse(answer.notInProject);
  return {
    design: await designFromAnswer(answer.design),
    notInProject: reason.success ? reason.data : null,
  };
}
