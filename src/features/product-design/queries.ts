import { keepPreviousData, queryOptions, skipToken, useQuery } from "@tanstack/react-query";

import { ApiError } from "@/lib/api/error";
import { QUERY_TIMES } from "@/lib/api/query-client";
import { retryTransient } from "@/lib/api/retry";

import {
  getAssetDownloadUrl,
  getDesign,
  getDesignDocument,
  getDesignHistory,
  getDraftCount,
  getPrintConfig,
  listDesignAssets,
  listDesignFiles,
  listDesigns,
} from "./api";
import type { Design, DesignListParams, DownloadLink, PrintConfig } from "./types";

// Every per-design key nests under `detail(id)`, so deleting a design forgets all of it at once;
// writes that only change the design itself match `detail(id)` exactly. A short-lived link is
// outside it: re-reading a design must not hand its images new URLs.
export const designKeys = {
  all: ["designs"] as const,
  lists: () => [...designKeys.all, "list"] as const,
  list: (p: DesignListParams) => [...designKeys.lists(), p] as const,
  draftCount: () => [...designKeys.all, "draft-count"] as const,
  details: () => [...designKeys.all, "detail"] as const,
  detail: (id: string) => [...designKeys.details(), id] as const,
  history: (id: string) => [...designKeys.detail(id), "history"] as const,
  document: (id: string) => [...designKeys.detail(id), "document"] as const,
  assets: (id: string) => [...designKeys.detail(id), "assets"] as const,
  files: (id: string) => [...designKeys.detail(id), "files"] as const,
  downloadLink: (designId: string, assetId: string) =>
    [...designKeys.all, "download-link", designId, assetId] as const,
};

export const printConfigKeys = {
  all: ["print-configs"] as const,
  detail: (productSlug: string, sku: string) => [...printConfigKeys.all, productSlug, sku] as const,
};

export function useDesignList(params: DesignListParams) {
  return useQuery({
    queryKey: designKeys.list(params),
    queryFn: ({ signal }) => listDesigns(params, signal),
    placeholderData: keepPreviousData, // no flash between pages or tabs
    retry: retryTransient,
    ...QUERY_TIMES.list,
  });
}

/** "x/50 bản nháp" (docs 12 §4.1, B37). */
export function useDraftCount(enabled = true) {
  return useQuery({
    queryKey: designKeys.draftCount(),
    queryFn: ({ signal }) => getDraftCount(signal),
    enabled,
    retry: retryTransient,
    ...QUERY_TIMES.list,
  });
}

/** The query of one design, for `useDesign` and for a step that needs it fresh. */
export function designQuery(id: string) {
  return queryOptions({
    queryKey: designKeys.detail(id),
    queryFn: ({ signal }) => getDesign(id, signal),
    retry: retryTransient,
    ...QUERY_TIMES.detail,
  });
}

/** How often a design is re-read while the customer waits for the review. */
export const DESIGN_POLL_MS = 5_000;

/** The one status that changes without the customer: the Sales Manager approves or returns it. */
const awaitsReview = (design: Design | undefined) => design?.status === "PENDING_REVIEW";

/**
 * One design. While it is PENDING_REVIEW it is re-read every 5 s and whenever the window regains
 * focus, so the review's answer shows up without a reload; otherwise it is read like any detail.
 */
export function useDesign(id: string) {
  return useQuery({
    ...designQuery(id),
    refetchInterval: (query) => (awaitsReview(query.state.data) ? DESIGN_POLL_MS : false),
    refetchOnWindowFocus: (query) => (awaitsReview(query.state.data) ? "always" : true),
  });
}

/** The query of a design's stored document; a conflict reload fetches it fresh. */
export function designDocumentQuery(id: string) {
  return queryOptions({
    queryKey: designKeys.document(id),
    queryFn: ({ signal }) => getDesignDocument(id, signal),
    retry: retryTransient,
    ...QUERY_TIMES.detail,
  });
}

/**
 * A design's document. A design always has one, so a 404 is an error, never "empty". The editor
 * owns the document while it is open and autosave writes it into this cache, so the query never
 * refetches behind its back.
 */
export function useDesignDocument(id: string, enabled: boolean) {
  return useQuery({
    ...designDocumentQuery(id),
    enabled,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

export function useDesignAssets(id: string, enabled: boolean) {
  return useQuery({
    queryKey: designKeys.assets(id),
    queryFn: ({ signal }) => listDesignAssets(id, signal),
    enabled,
    retry: retryTransient,
    ...QUERY_TIMES.detail,
  });
}

export function useDesignHistory(id: string) {
  return useQuery({
    queryKey: designKeys.history(id),
    queryFn: ({ signal }) => getDesignHistory(id, signal),
    retry: retryTransient,
    ...QUERY_TIMES.detail,
  });
}

/** The files of the latest submission (`[]` before one). */
export function useDesignFiles(id: string, enabled: boolean) {
  return useQuery({
    queryKey: designKeys.files(id),
    queryFn: ({ signal }) => listDesignFiles(id, signal),
    enabled,
    retry: retryTransient,
    ...QUERY_TIMES.detail,
  });
}

/** A variant without a print configuration answers 404: that is an answer (`null`), not a failure. */
function noneWhenNotFound(error: unknown): null {
  if (error instanceof ApiError && error.status === 404) return null;
  throw error;
}

/** The variant's print configuration, or `null` when it has none (catalog BR-14: no "Thiết kế"). */
export function usePrintConfig(productSlug: string, sku: string, enabled: boolean) {
  return useQuery({
    queryKey: printConfigKeys.detail(productSlug, sku),
    queryFn: ({ signal }): Promise<PrintConfig | null> =>
      getPrintConfig(productSlug, sku, signal).catch(noneWhenNotFound),
    enabled,
    retry: retryTransient,
    ...QUERY_TIMES.detail,
  });
}

/** A link is replaced this long before it expires, so an image never starts loading on a dead one. */
const LINK_EXPIRY_MARGIN_MS = 30_000;

/**
 * How long a short-lived link stays fresh: from the moment it was fetched until 30 s before
 * `expiresAt`. Zero when it is already that close, or when the date cannot be read.
 */
export function downloadLinkStaleTime(link: DownloadLink | undefined, fetchedAt: number) {
  const expiresAt = link ? Date.parse(link.expiresAt) : Number.NaN;
  return Number.isNaN(expiresAt) ? 0 : Math.max(expiresAt - fetchedAt - LINK_EXPIRY_MARGIN_MS, 0);
}

/**
 * The query of an image's short-lived link, cached until 30 s before `expiresAt`. Shared by
 * `useDownloadLink` and by callers that fetch links imperatively (one per image of a document).
 */
export function downloadLinkQuery(designId: string, assetId: string) {
  return queryOptions({
    queryKey: designKeys.downloadLink(designId, assetId),
    queryFn: ({ signal }) => getAssetDownloadUrl(designId, assetId, signal),
    staleTime: (query) => downloadLinkStaleTime(query.state.data, query.state.dataUpdatedAt),
    retry: retryTransient,
  });
}

/** An image's short-lived link; a list of images reads each once. No request without an id. */
export function useDownloadLink(
  designId: string,
  assetId: string | null | undefined,
  enabled: boolean,
) {
  const query = downloadLinkQuery(designId, assetId ?? "");
  const wanted = enabled && Boolean(assetId);
  return useQuery({ ...query, queryFn: wanted ? (query.queryFn ?? skipToken) : skipToken });
}
