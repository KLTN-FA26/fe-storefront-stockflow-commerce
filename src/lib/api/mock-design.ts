/**
 * Mock routes of Module 12 (spec 2026-11-09 §4.2, §4.3; projects: part E spec §4): the docs'
 * design API, served by the store of `mock-fixtures/design-store.ts`, and the reviewer simulation
 * under `/__mock`. Responses use the ApiResponse envelope; the mock adapter turns error statuses
 * into ApiError.
 * The first matching pattern wins, so `/designs/draft-count` is registered before `/designs/:id`.
 */

import type { AxiosRequestConfig } from "axios";

import { registerMockRoute } from "./mock-adapter";
import {
  BUNDLE_ROLES,
  fail,
  fileRejected,
  ok,
  type BundleRole,
  type MockResult,
} from "./mock-fixtures/design-rows";
import { openDesignStorage } from "./mock-fixtures/design-storage";
import { createDesignMockStore, type DesignMockStore } from "./mock-fixtures/design-store";
import type { BundleForm } from "./mock-fixtures/design-store-files";
import type { DesignSubmission } from "./mock-fixtures/design-store-submission";

const respond = (result: MockResult) => ({ status: result.status, data: result.data, headers: {} });

const param = (config: AxiosRequestConfig, name: string) => {
  const params = (config as AxiosRequestConfig & { _mockParams?: Record<string, string> })
    ._mockParams;
  return decodeURIComponent(params?.[name] ?? "");
};

function queryParams(config: AxiosRequestConfig): Record<string, unknown> {
  const raw: unknown = config.params;
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
}

const parseJson = (text: string | undefined): unknown => {
  if (text === undefined) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

/** A JSON body: axios hands the adapter the serialised string. */
const bodyOf = (config: AxiosRequestConfig): unknown =>
  typeof config.data === "string" ? parseJson(config.data) : config.data;

/** A request header by name, ignoring case: axios hands the adapter an `AxiosHeaders`, tests a plain object. */
function headerOf(config: AxiosRequestConfig, name: string): string | undefined {
  const headers: unknown = config.headers;
  if (!headers || typeof headers !== "object") return undefined;
  const wanted = name.toLowerCase();
  const found = Object.entries(headers).find(([key]) => key.toLowerCase() === wanted)?.[1];
  return typeof found === "string" ? found : undefined;
}

/** A multipart body (duck-typed: the FormData may come from another realm in tests). */
function formOf(config: AxiosRequestConfig): FormData | undefined {
  const data: unknown = config.data;
  return typeof data === "object" && data !== null && typeof (data as FormData).get === "function"
    ? (data as FormData)
    : undefined;
}

/** A Blob, duck-typed like `formOf`: one from another realm is not `instanceof Blob` here. */
function isBlobLike(value: unknown): value is Blob {
  if (typeof value !== "object" || value === null) return false;
  const blob = value as Partial<Record<keyof Blob, unknown>>;
  return (
    typeof blob.arrayBuffer === "function" &&
    typeof blob.size === "number" &&
    typeof blob.type === "string"
  );
}

const blobPart = (form: FormData | undefined, name: string) => {
  const part: unknown = form?.get(name);
  return isBlobLike(part) ? part : undefined;
};

const textPart = (form: FormData | undefined, name: string) => {
  const part = form?.get(name);
  return typeof part === "string" ? part : undefined;
};

/** The files of a bundle (one part per role) and their `checksums`, as a multipart sends them. */
function bundleOf(form: FormData | undefined): BundleForm {
  const files: Partial<Record<BundleRole, Blob>> = {};
  for (const role of BUNDLE_ROLES) {
    const file = blobPart(form, role);
    if (file) files[role] = file;
  }
  return { checksums: parseJson(textPart(form, "checksums")), files };
}

/** The multipart parts of a submission: `version`, `preflight`, `checksums` and one file per role. */
function submissionOf(config: AxiosRequestConfig): DesignSubmission {
  const form = formOf(config);
  const version = textPart(form, "version");
  return {
    version: version === undefined || version.trim() === "" ? undefined : Number(version),
    preflight: parseJson(textPart(form, "preflight")),
    ...bundleOf(form),
  };
}

/**
 * 503: the design mock never started (logged once by `setUpDesignMock`), or is still starting
 * after `START_TIMEOUT_MS` (logged by `started`).
 */
const unavailable = () =>
  fail(503, "DESIGN_MOCK_UNAVAILABLE", "The design mock did not start; see the browser console");

/** How long a design request waits for the store to start, e.g. an IndexedDB open that hangs. */
const START_TIMEOUT_MS = 10_000;

/** The store once it started; null when it failed to, or did not within `START_TIMEOUT_MS`. */
async function started(ready: Promise<DesignMockStore>): Promise<DesignMockStore | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      console.warn(
        `[mock-design] The design mock has not started after ${START_TIMEOUT_MS / 1000} s; this request answers 503.`,
      );
      resolve(null);
    }, START_TIMEOUT_MS);
  });
  try {
    return await Promise.race([ready.catch(() => null), late]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Registers the design routes over `store`. A pending store is waited for by each design request
 * only, so the rest of the mock never waits on it; a store that failed to start, or has not after
 * 10 s, answers 503.
 */
export function registerDesignMockRoutes(store: DesignMockStore | Promise<DesignMockStore>): void {
  const ready = Promise.resolve(store);
  ready.catch(() => undefined); // answered per request below, logged by `setUpDesignMock`

  const route = (
    method: string,
    pattern: string,
    run: (store: DesignMockStore, config: AxiosRequestConfig) => Promise<MockResult>,
  ) =>
    registerMockRoute(method, pattern, async (config) => {
      const store = await started(ready);
      return respond(store ? await run(store, config) : unavailable());
    });
  const id = (config: AxiosRequestConfig) => param(config, "id");

  /* ── Designs ── */

  route("GET", "/designs", (s, config) => s.list(queryParams(config)));
  route("GET", "/designs/draft-count", (s) => s.draftCount());
  route("POST", "/designs", (s, config) => s.create(bodyOf(config)));
  route("GET", "/designs/:id", (s, config) => s.get(id(config)));
  route("PATCH", "/designs/:id", (s, config) => s.rename(id(config), bodyOf(config)));
  route("DELETE", "/designs/:id", (s, config) => s.remove(id(config), bodyOf(config)));
  route("GET", "/designs/:id/history", (s, config) => s.history(id(config)));
  route("GET", "/designs/:id/document", (s, config) => s.getDocument(id(config)));
  route("PUT", "/designs/:id/document", (s, config) => s.putDocument(id(config), bodyOf(config)));

  /* ── Projects (part E spec §4) ── */

  route("GET", "/design-projects", (s, config) => s.listProjects(queryParams(config)));
  route("POST", "/design-projects", (s, config) => s.createProject(bodyOf(config)));
  route("GET", "/design-projects/:id", (s, config) => s.getProject(id(config)));
  route("PATCH", "/design-projects/:id", (s, config) =>
    s.updateProject(id(config), bodyOf(config)),
  );
  route("POST", "/design-projects/:id/archive", (s, config) =>
    s.archiveProject(id(config), bodyOf(config)),
  );
  route("GET", "/design-projects/:id/designs", (s, config) => s.projectDesigns(id(config)));
  route("POST", "/design-projects/:id/designs", (s, config) =>
    s.addToProject(id(config), bodyOf(config)),
  );
  route("DELETE", "/design-projects/:id/designs/:designId", (s, config) =>
    s.removeFromProject(id(config), param(config, "designId")),
  );
  route("GET", "/design-projects/:id/history", (s, config) => s.projectHistory(id(config)));
  route("POST", "/design-projects/:id/review-rounds", (s, config) =>
    s.openReviewRound(id(config), bodyOf(config)),
  );
  route("POST", "/design-projects/:id/preflight-failures", (s, config) =>
    s.recordSetPreflightFailure(id(config), bodyOf(config)),
  );
  route("GET", "/design-projects/:id/library", (s, config) => s.listLibrary(id(config)));
  route("POST", "/design-projects/:id/library/images", async (s, config) => {
    const file = blobPart(formOf(config), "file");
    if (!file) return fileRejected("The file part is required");
    return s.uploadLibraryImage(id(config), file, undefined, headerOf(config, "Idempotency-Key"));
  });
  route("POST", "/design-projects/:id/library/images/from-design", (s, config) =>
    s.saveLibraryImageFromDesign(id(config), bodyOf(config)),
  );
  route("POST", "/design-projects/:id/library/texts", (s, config) =>
    s.saveLibraryText(id(config), bodyOf(config)),
  );
  route("DELETE", "/design-projects/:id/library/:itemId", (s, config) =>
    s.deleteLibraryItem(id(config), param(config, "itemId")),
  );

  /* ── Images ── */

  route("GET", "/designs/:id/assets", (s, config) => s.listAssets(id(config)));
  route("POST", "/designs/:id/assets", async (s, config) => {
    const file = blobPart(formOf(config), "file");
    if (!file) return fileRejected("The file part is required");
    return s.uploadAsset(id(config), file, undefined, headerOf(config, "Idempotency-Key"));
  });
  route("POST", "/designs/:id/assets/from-library", (s, config) =>
    s.placeFromLibrary(id(config), bodyOf(config)),
  );
  route("GET", "/designs/:id/assets/:assetId/url", (s, config) =>
    s.assetLink(id(config), param(config, "assetId")),
  );

  /* ── Submitting and after ── */

  route("POST", "/designs/:id/submissions", (s, config) =>
    s.submit(id(config), submissionOf(config)),
  );
  route("POST", "/designs/:id/submission-uploads", (s, config) =>
    s.uploadSubmission(id(config), bundleOf(formOf(config)), headerOf(config, "Idempotency-Key")),
  );
  route("POST", "/designs/:id/preflight-failures", (s, config) =>
    s.recordPreflightFailure(id(config), bodyOf(config)),
  );
  route("GET", "/designs/:id/files", (s, config) => s.files(id(config)));
  route("POST", "/designs/:id/revisions", (s, config) => s.revise(id(config)));
  route("POST", "/designs/:id/clones", (s, config) =>
    s.clone(id(config), bodyOf(config), headerOf(config, "Idempotency-Key")),
  );

  /* ── Catalogue ── */

  route("GET", "/catalog/products/:slug/variants/:sku/print-config", (s, config) =>
    s.printConfig(param(config, "slug"), param(config, "sku")),
  );

  /* ── Reviewer simulation (mock only, spec §4.3) ── */

  route("POST", "/__mock/designs/:id/approve", (s, config) => s.simulateApprove(id(config)));
  route("POST", "/__mock/designs/:id/return", (s, config) =>
    s.simulateReturn(id(config), bodyOf(config)),
  );
  route("POST", "/__mock/designs/:id/fail-next-approval", (s, config) =>
    s.simulateFailNextApproval(id(config), bodyOf(config)),
  );
  route("GET", "/__mock/design-rounds", (s) => s.simulateRounds());
  route("POST", "/__mock/design-rounds/:id/approve-all", (s, config) =>
    s.simulateApproveRound(id(config)),
  );
  route("POST", "/__mock/reset", (s) => s.reset());
  // Whether the mock data survives a reload: the panel says so when it does not.
  route("GET", "/__mock/storage", async (s) => ok({ persistent: s.persistent }));
}

/**
 * Registers the design routes now and opens the design mock's storage (IndexedDB, memory when the
 * browser refuses it) behind them: the one set-up path for the full mock and the design-only one.
 * Nothing waits for it but design requests; if it fails, they answer 503 and the console says why.
 */
export function setUpDesignMock(): Promise<DesignMockStore> {
  const store = openDesignStorage().then((storage) => createDesignMockStore({ storage }));
  registerDesignMockRoutes(store);
  store.catch((error: unknown) => {
    console.error(
      "[mock-design] The design mock did not start; design requests answer 503.",
      error,
    );
  });
  return store;
}
