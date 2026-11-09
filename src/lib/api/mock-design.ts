/**
 * Mock routes of Module 12 (spec 2026-11-09 §4.2, §4.3): the docs' design API, served by the store
 * of `mock-fixtures/design-store.ts`, and the reviewer simulation under `/__mock`. Responses use
 * the ApiResponse envelope; the mock adapter turns error statuses into ApiError.
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
import type { DesignSubmission } from "./mock-fixtures/design-store-files";

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

const blobPart = (form: FormData | undefined, name: string) => {
  const part = form?.get(name);
  return part instanceof Blob ? part : undefined;
};

const textPart = (form: FormData | undefined, name: string) => {
  const part = form?.get(name);
  return typeof part === "string" ? part : undefined;
};

/** The multipart parts of a submission: `version`, `preflight`, `checksums` and one file per role. */
function submissionOf(config: AxiosRequestConfig): DesignSubmission {
  const form = formOf(config);
  const version = textPart(form, "version");
  const files: Partial<Record<BundleRole, Blob>> = {};
  for (const role of BUNDLE_ROLES) {
    const file = blobPart(form, role);
    if (file) files[role] = file;
  }
  return {
    version: version === undefined || version.trim() === "" ? undefined : Number(version),
    preflight: parseJson(textPart(form, "preflight")),
    checksums: parseJson(textPart(form, "checksums")),
    files,
  };
}

/** 503: the design mock never started (logged once by `setUpDesignMock`). */
const unavailable = () =>
  fail(503, "DESIGN_MOCK_UNAVAILABLE", "The design mock did not start; see the browser console");

/**
 * Registers the design routes over `store`. A pending store is waited for by each design request
 * only, so the rest of the mock never waits on it; a store that failed to start answers 503.
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
      const started = await ready.catch(() => null);
      return respond(started ? await run(started, config) : unavailable());
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

  /* ── Images ── */

  route("GET", "/designs/:id/assets", (s, config) => s.listAssets(id(config)));
  route("POST", "/designs/:id/assets", async (s, config) => {
    const file = blobPart(formOf(config), "file");
    if (!file) return fileRejected("The file part is required");
    return s.uploadAsset(id(config), file, undefined, headerOf(config, "Idempotency-Key"));
  });
  route("GET", "/designs/:id/assets/:assetId/url", (s, config) =>
    s.assetLink(id(config), param(config, "assetId")),
  );

  /* ── Submitting and after ── */

  route("POST", "/designs/:id/submissions", (s, config) =>
    s.submit(id(config), submissionOf(config)),
  );
  route("POST", "/designs/:id/preflight-failures", (s, config) =>
    s.recordPreflightFailure(id(config), bodyOf(config)),
  );
  route("GET", "/designs/:id/files", (s, config) => s.files(id(config)));
  route("POST", "/designs/:id/revisions", (s, config) => s.revise(id(config)));

  /* ── Catalogue ── */

  route("GET", "/catalog/products/:slug/variants/:sku/print-config", (s, config) =>
    s.printConfig(param(config, "slug"), param(config, "sku")),
  );

  /* ── Reviewer simulation (mock only, spec §4.3) ── */

  route("POST", "/__mock/designs/:id/approve", (s, config) => s.simulateApprove(id(config)));
  route("POST", "/__mock/designs/:id/return", (s, config) =>
    s.simulateReturn(id(config), bodyOf(config)),
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
