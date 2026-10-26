import { keepPreviousData, queryOptions, skipToken, useQuery } from "@tanstack/react-query";

import { QUERY_TIMES } from "@/lib/api/query-client";
import { retryTransient } from "@/lib/api/retry";

import {
  getArtifactDownloadUrl,
  getAssetDownloadUrl,
  getCustomization,
  getDesign,
  getDesignDocument,
  getDesignHistory,
  getDesignSnapshot,
  listArtifacts,
  listDesignAssets,
  listDesigns,
} from "./api";
import { deriveUiState, type DesignUiState } from "./lifecycle";
import type { DesignDraft, DesignListParams, DownloadLink } from "./types";

export type DownloadLinkKind = "asset" | "artifact";

// Every per-design key nests under `detail(id)`, so one prefix identifies a design's cache. A
// presigned link is deliberately outside it: a workflow step must not hand a card a new image URL.
export const designKeys = {
  all: ["designs"] as const,
  lists: () => [...designKeys.all, "list"] as const,
  list: (p: DesignListParams) => [...designKeys.lists(), p] as const,
  details: () => [...designKeys.all, "detail"] as const,
  detail: (id: string) => [...designKeys.details(), id] as const,
  document: (id: string) => [...designKeys.detail(id), "document"] as const,
  assets: (id: string) => [...designKeys.detail(id), "assets"] as const,
  artifacts: (id: string) => [...designKeys.detail(id), "artifacts"] as const,
  history: (id: string) => [...designKeys.detail(id), "history"] as const,
  snapshot: (id: string) => [...designKeys.detail(id), "snapshot"] as const,
  customization: (slug: string) => [...designKeys.all, "customization", slug] as const,
  downloadLink: (kind: DownloadLinkKind, designId: string, id: string) =>
    [...designKeys.all, "download-link", kind, designId, id] as const,
};

/** The decision log of one design is a handful of rows: one page holds it. */
export const DESIGN_HISTORY_SIZE = 50;

/** A link is replaced this long before it expires, so an image never starts loading on a dead one. */
const LINK_EXPIRY_MARGIN_MS = 30_000;

/**
 * How long a presigned link stays fresh: from the moment it was fetched until 30 s before
 * `expiresAt`. Zero when it is already that close, or when the date cannot be read.
 */
export function downloadLinkStaleTime(link: DownloadLink | undefined, fetchedAt: number) {
  const expiresAt = link ? Date.parse(link.expiresAt) : Number.NaN;
  return Number.isNaN(expiresAt) ? 0 : Math.max(expiresAt - fetchedAt - LINK_EXPIRY_MARGIN_MS, 0);
}

export function useDesignList(params: DesignListParams) {
  return useQuery({
    queryKey: designKeys.list(params),
    queryFn: ({ signal }) => listDesigns(params, signal),
    placeholderData: keepPreviousData, // no flash between pages or tabs
    retry: retryTransient,
    ...QUERY_TIMES.list,
  });
}

/** How often a design is re-read while the customer waits on QC or Sales (R66). */
export const DESIGN_POLL_MS = 5_000;

/** The states that change without the customer doing anything: QC answers, Sales send it back. */
const WAITING_STATES: ReadonlySet<DesignUiState> = new Set([
  "awaitingReview",
  "awaitingConfirmation",
]);

const isWaiting = (draft: DesignDraft | undefined) =>
  draft !== undefined && WAITING_STATES.has(deriveUiState(draft));

/** The query of one design, for `useDesign` and for a workflow step that needs it fresh. */
export function designQuery(id: string) {
  return queryOptions({
    queryKey: designKeys.detail(id),
    queryFn: ({ signal }) => getDesign(id, signal),
    retry: retryTransient,
    ...QUERY_TIMES.detail,
  });
}

/**
 * One design. While the customer waits on QC or Sales (`awaitingReview`, `awaitingConfirmation`)
 * it is re-read every 5 s and whenever the window regains focus, so their answer shows up without
 * a reload; in every other state it is read like any detail.
 */
export function useDesign(id: string) {
  return useQuery({
    ...designQuery(id),
    refetchInterval: (query) => (isWaiting(query.state.data) ? DESIGN_POLL_MS : false),
    refetchOnWindowFocus: (query) => (isWaiting(query.state.data) ? "always" : true),
  });
}

/** The query of a design's stored document (P3); a conflict reload fetches it fresh. */
export function designDocumentQuery(id: string) {
  return queryOptions({
    queryKey: designKeys.document(id),
    queryFn: ({ signal }) => getDesignDocument(id, signal),
    retry: retryTransient,
    ...QUERY_TIMES.detail,
  });
}

/**
 * P3 (spec §7.2): pass `designCapabilities(isMock).document`. A design always has a document
 * (the BE seeds one), so a 404 is an error, never "empty". The editor owns the document while it
 * is open and autosave writes it into this cache, so the query never refetches behind its back.
 */
export function useDesignDocument(id: string, enabled: boolean) {
  return useQuery({
    ...designDocumentQuery(id),
    enabled,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

/** P4: pass `designCapabilities(isMock).assets`. */
export function useDesignAssets(id: string, enabled: boolean) {
  return useQuery({
    queryKey: designKeys.assets(id),
    queryFn: ({ signal }) => listDesignAssets(id, signal),
    enabled,
    retry: retryTransient,
    ...QUERY_TIMES.detail,
  });
}

export function useDesignArtifacts(id: string) {
  return useQuery({
    queryKey: designKeys.artifacts(id),
    queryFn: ({ signal }) => listArtifacts(id, signal),
    retry: retryTransient,
    ...QUERY_TIMES.detail,
  });
}

export function useDesignHistory(id: string) {
  return useQuery({
    queryKey: designKeys.history(id),
    queryFn: ({ signal }) => getDesignHistory(id, { page: 1, size: DESIGN_HISTORY_SIZE }, signal),
    retry: retryTransient,
    ...QUERY_TIMES.detail,
  });
}

/** The snapshot exists once the design is confirmed: pass `enabled` from the lifecycle state. */
export function useDesignSnapshot(id: string, enabled: boolean) {
  return useQuery({
    queryKey: designKeys.snapshot(id),
    queryFn: ({ signal }) => getDesignSnapshot(id, signal),
    enabled,
    retry: retryTransient,
    ...QUERY_TIMES.detail,
  });
}

/** P2: the PDP and `/design/new` read it for a `CUSTOMIZABLE` product. */
export function useCustomization(slug: string, enabled: boolean) {
  return useQuery({
    queryKey: designKeys.customization(slug),
    queryFn: ({ signal }) => getCustomization(slug, signal),
    enabled,
    retry: retryTransient,
    ...QUERY_TIMES.detail,
  });
}

/**
 * The query of a presigned link to a design's asset or artifact, cached until 30 s before
 * `expiresAt`. Shared by `useDownloadLink` and by callers that fetch links imperatively
 * (`queryClient.fetchQuery`, e.g. one link per image of a document).
 */
export function downloadLinkQuery(kind: DownloadLinkKind, designId: string, id: string) {
  const read = kind === "asset" ? getAssetDownloadUrl : getArtifactDownloadUrl;
  return queryOptions({
    queryKey: designKeys.downloadLink(kind, designId, id),
    queryFn: ({ signal }) => read(designId, id, signal),
    staleTime: (query) => downloadLinkStaleTime(query.state.data, query.state.dataUpdatedAt),
    retry: retryTransient,
  });
}

/**
 * A presigned link to a design's asset or artifact. It is cached until 30 s before `expiresAt`,
 * so a list of cards reads each link once. `id` is absent for a draft with no preview yet.
 */
export function useDownloadLink(
  kind: DownloadLinkKind,
  designId: string,
  id: string | null | undefined,
  enabled: boolean,
) {
  const query = downloadLinkQuery(kind, designId, id ?? "");
  const wanted = enabled && Boolean(id);
  return useQuery({ ...query, queryFn: wanted ? (query.queryFn ?? skipToken) : skipToken });
}
