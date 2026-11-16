/**
 * The design mock's projects, library and review rounds in the BE's own contract
 * (`DesignProjectController`, origin/develop 85e6036a), over the store's rows, as
 * `design-be-contract.ts` does for designs: the shapes the routes of `mock-design-projects.ts`
 * answer with, nulls omitted (`viaBe` strips them), the BE's names (`event`, `notes`, `createdAt`,
 * `assetId`, ...). A customer cannot read a review round, so there is no shape for one.
 */

import {
  asRecord,
  ok,
  type DesignDto,
  type LibraryItemDto,
  type MockResult,
  type ProjectDto,
  type ProjectEventDto,
} from "./design-rows";
import { omitNulls } from "./design-be-contract";
import { readPaging } from "./design-store-paging";

/** `DesignProjectSummaryResponse` of a project the store answered with. */
export const beProjectSummary = (project: ProjectDto) => ({
  id: project.id,
  name: project.name,
  description: project.description,
  status: project.status,
  version: project.version,
  designCount: project.designCount,
  createdAt: project.createdAt,
  archivedAt: project.status === "ARCHIVED" ? project.updatedAt : null,
});

/**
 * `DesignProjectResponse`: the project, its designs (as `DesignDraftResponse`s, archived aside) and
 * how many library images it holds. The store's own `previewUrls`, `openRound` and `updatedAt` are
 * not the BE's.
 */
export const beProjectResponse = (
  project: ProjectDto,
  designs: readonly Record<string, unknown>[],
  assetCount: number,
) => ({
  id: project.id,
  name: project.name,
  description: project.description,
  status: project.status,
  version: project.version,
  createdAt: project.createdAt,
  archivedAt: project.status === "ARCHIVED" ? project.updatedAt : null,
  designs,
  assetCount,
});

/** `GET …/history` of the store's events (oldest first): the page `query` asks for, newest first (F-16). */
export function beProjectHistoryPage(
  events: readonly ProjectEventDto[],
  query: unknown,
): MockResult {
  const paging = readPaging(asRecord(query));
  if ("refused" in paging) return paging.refused;
  const rows = events
    .toReversed()
    // The BE leaves a null note out of its JSON.
    .map((event) => omitNulls({ event: event.type, notes: event.note, createdAt: event.at }));
  const { page, size } = paging;
  const totalPages = Math.ceil(rows.length / size);
  return ok({
    items: rows.slice(page * size, (page + 1) * size),
    page,
    size,
    totalElements: rows.length,
    totalPages,
    hasNext: page + 1 < totalPages,
    hasPrevious: page > 0,
  });
}

/** `DesignProjectAssetResponse` of a library image. */
export function beProjectAsset(item: LibraryItemDto, projectId: string) {
  if (item.kind !== "IMAGE") return null;
  const { originalName, contentType, sizeBytes, checksum, widthPx, heightPx, storedAt } =
    item.asset;
  return {
    assetId: item.id,
    projectId,
    originalName,
    contentType,
    sizeBytes,
    checksum,
    widthPx,
    heightPx,
    storedAt,
  };
}

/** `DesignProjectTextResponse` of a library text: a style whose `outline` is left out when there is none. */
export function beProjectText(item: LibraryItemDto, projectId: string) {
  if (item.kind !== "TEXT") return null;
  return { id: item.id, projectId, text: item.text, style: item.style, createdAt: item.createdAt };
}

/** 204 with no body: the BE's answer to removing a library file or text. */
export const noContent = (): MockResult => ({ status: 204, data: undefined });

/** A library list, by kind, newest first. */
export function libraryOf(result: MockResult): LibraryItemDto[] {
  const body = asRecord(result.data);
  return body.success === true && Array.isArray(body.data) ? (body.data as LibraryItemDto[]) : [];
}

/** The designs the store answered with, as a list; empty for a refusal. */
export function designsOf(result: MockResult): DesignDto[] {
  const body = asRecord(result.data);
  return body.success === true && Array.isArray(body.data) ? (body.data as DesignDto[]) : [];
}
