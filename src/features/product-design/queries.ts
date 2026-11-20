import {
  keepPreviousData,
  queryOptions,
  skipToken,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { isDesignMockMode } from "@/lib/api/design-mock-flag";
import { ApiError } from "@/lib/api/error";
import { QUERY_TIMES } from "@/lib/api/query-client";
import { retryTransient } from "@/lib/api/retry";

import {
  getAssetDownloadUrl,
  getDesign,
  getDesignDocument,
  getDesignHistory,
  filesOfSnapshot,
  getDesignPrintConfig,
  getDesignSnapshot,
  getDraftCount,
  listDesignAssets,
  listDesignFiles,
  listDesigns,
  printConfigOfSku,
  readProductCustomization,
} from "./api";
import type { Design, DesignListParams, DownloadLink, PrintConfig } from "./types";

import { DESIGN_POLL_MS, projectQuery } from "./project-queries";

export * from "./project-queries"; // the projects' keys and queries live in their own file

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
  /** Its quote requests (A-3), newest first: an ask or a submission with one re-reads them. */
  quoteRequests: (id: string) => [...designKeys.detail(id), "quote-requests"] as const,
  /** The approved design's frozen bundle (files and customer SKU): read once, it never changes. */
  snapshot: (id: string) => [...designKeys.detail(id), "snapshot"] as const,
  /** The latest submission's files, or the approved snapshot's: two reads, two entries. */
  fileList: (id: string, approved: boolean) =>
    [...designKeys.files(id), approved ? "approved" : "latest"] as const,
  /** The SKUs of a product's variants, read for "Nhân bản sang cỡ khác". */
  variantSkus: (productSlug: string) => [...designKeys.all, "variant-skus", productSlug] as const,
  downloadLink: (designId: string, assetId: string) =>
    [...designKeys.all, "download-link", designId, assetId] as const,
};

export const printConfigKeys = {
  all: ["print-configs"] as const,
  /** A variant's, from the product's customization (launcher, new design). */
  detail: (productSlug: string, sku: string) => [...printConfigKeys.all, productSlug, sku] as const,
  /** A product's customization and title, shared by its variants' (`hint`: the mock's SKU, else null). */
  customization: (productSlug: string, hint: string | null) =>
    [...printConfigKeys.all, "customization", productSlug, hint] as const,
  /** A design's, from its own template (studio, export). */
  design: (designId: string) => [...printConfigKeys.all, "design", designId] as const,
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

/**
 * The query of one design, for `useDesign` and for a step that needs it fresh. Its project's name
 * and status come from the project's own query, read once and kept until a project-changing write
 * invalidates it (`reReadProject`, `reReadProjects`): the 5 s poll of a design in review re-reads
 * the design, never the whole project (Data M-6).
 */
export function designQuery(id: string) {
  return queryOptions({
    queryKey: designKeys.detail(id),
    queryFn: ({ signal, client }) =>
      getDesign(id, signal, (projectId) =>
        client.fetchQuery({ ...projectQuery(projectId), staleTime: Infinity }),
      ),
    retry: retryTransient,
    ...QUERY_TIMES.detail,
  });
}

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

/** An approved design's snapshot: frozen at approval, so it is never stale and never read twice. */
const snapshotQuery = (id: string) =>
  queryOptions({
    queryKey: designKeys.snapshot(id),
    queryFn: ({ signal }) => getDesignSnapshot(id, signal),
    retry: retryTransient,
    staleTime: Infinity,
    gcTime: QUERY_TIMES.detail.gcTime,
  });

/**
 * The customer's own SKU of an APPROVED design, from its snapshot (the design list does not carry
 * it yet: BE-2). `null` while there is none, and for a design not approved: nothing is read then.
 * Meant for one design's own screen (the studio's status bar), never one per list card.
 */
export function useDesignCustomerSku(id: string, approved: boolean) {
  const snapshot = useQuery({ ...snapshotQuery(id), enabled: approved });
  return { sku: snapshot.data?.customerSku ?? null, isPending: approved && snapshot.isPending };
}

/**
 * The files of the latest submission (`[]` before one), or of the approved snapshot (`approved`):
 * each read under its own key, so one never answers for the other.
 */
export function useDesignFiles(id: string, enabled: boolean, approved = false) {
  const client = useQueryClient();
  return useQuery({
    queryKey: designKeys.fileList(id, approved),
    // The approved list is cut from the shared snapshot query: the studio reads `/snapshot` once.
    queryFn: approved
      ? async ({ signal }) =>
          filesOfSnapshot(id, await client.ensureQueryData(snapshotQuery(id)), signal)
      : ({ signal }) => listDesignFiles(id, signal),
    enabled,
    retry: retryTransient,
    ...QUERY_TIMES.detail,
  });
}

/**
 * A variant the BE does not list answers 404, and a product that cannot be customized 409
 * `PRODUCT_NOT_CUSTOMIZABLE`: both are an answer (`null`: no print configuration), not a failure.
 */
function noneWhenNotFound(error: unknown): null {
  if (
    error instanceof ApiError &&
    (error.status === 404 || error.code === "PRODUCT_NOT_CUSTOMIZABLE")
  ) {
    return null;
  }
  throw error;
}

/**
 * The query of a product's customization and title, which every variant's print configuration is
 * made from: one read for all of a product's SKUs (Data M-7). In design mock mode only, the SKU is
 * part of the key: the mock uses it as a hint for a product it does not know.
 */
export function productCustomizationQuery(productSlug: string, sku: string) {
  const hint = isDesignMockMode() ? sku : null;
  return queryOptions({
    queryKey: printConfigKeys.customization(productSlug, hint),
    queryFn: ({ signal }) => readProductCustomization(productSlug, sku, signal),
    retry: retryTransient,
    ...QUERY_TIMES.detail,
  });
}

/** The query of a variant's print configuration: `null` when it has none (a 404). */
export function printConfigQuery(productSlug: string, sku: string) {
  return queryOptions({
    queryKey: printConfigKeys.detail(productSlug, sku),
    queryFn: ({ client }): Promise<PrintConfig | null> =>
      client
        // One attempt here: this query's own retry covers a transient failure.
        .fetchQuery({ ...productCustomizationQuery(productSlug, sku), retry: false })
        .then((read) => printConfigOfSku(read, sku))
        .catch(noneWhenNotFound),
    retry: retryTransient,
    ...QUERY_TIMES.detail,
  });
}

/** The query of a design's print configuration (its own template, F-23): `null` when it has none. */
export function designPrintConfigQuery(design: Pick<Design, "id" | "product" | "variant">) {
  return queryOptions({
    queryKey: printConfigKeys.design(design.id),
    queryFn: ({ signal }): Promise<PrintConfig | null> =>
      getDesignPrintConfig(design, signal).catch(noneWhenNotFound),
    retry: retryTransient,
    ...QUERY_TIMES.detail,
  });
}

/** The print configuration a design is drawn on, once the design is read; `null` when it has none. */
export function useDesignPrintConfig(design: Design | undefined) {
  const query = designPrintConfigQuery(
    design ?? { id: "", product: { slug: null, title: "" }, variant: { sku: "", label: "" } },
  );
  return useQuery({ ...query, enabled: design !== undefined });
}

/** The variant's print configuration, or `null` when it has none (catalog BR-14: no "Thiết kế"). */
export function usePrintConfig(productSlug: string, sku: string, enabled: boolean) {
  return useQuery({ ...printConfigQuery(productSlug, sku), enabled });
}

/** The print configurations of a product's variants, one query each, in the order of `skus`. */
export function usePrintConfigs(productSlug: string, skus: readonly string[]) {
  return useQueries({ queries: skus.map((sku) => printConfigQuery(productSlug, sku)) });
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
