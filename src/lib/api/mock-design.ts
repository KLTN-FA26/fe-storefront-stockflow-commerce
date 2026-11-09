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
  fileRejected,
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

export function registerDesignMockRoutes(store: DesignMockStore): void {
  const id = (config: AxiosRequestConfig) => param(config, "id");

  /* ── Designs ── */

  registerMockRoute("GET", "/designs", async (config) =>
    respond(await store.list(queryParams(config))),
  );
  registerMockRoute("GET", "/designs/draft-count", async () => respond(await store.draftCount()));
  registerMockRoute("POST", "/designs", async (config) =>
    respond(await store.create(bodyOf(config))),
  );
  registerMockRoute("GET", "/designs/:id", async (config) => respond(await store.get(id(config))));
  registerMockRoute("PATCH", "/designs/:id", async (config) =>
    respond(await store.rename(id(config), bodyOf(config))),
  );
  registerMockRoute("DELETE", "/designs/:id", async (config) =>
    respond(await store.remove(id(config), bodyOf(config))),
  );
  registerMockRoute("GET", "/designs/:id/history", async (config) =>
    respond(await store.history(id(config))),
  );

  registerMockRoute("GET", "/designs/:id/document", async (config) =>
    respond(await store.getDocument(id(config))),
  );
  registerMockRoute("PUT", "/designs/:id/document", async (config) =>
    respond(await store.putDocument(id(config), bodyOf(config))),
  );

  /* ── Images ── */

  registerMockRoute("GET", "/designs/:id/assets", async (config) =>
    respond(await store.listAssets(id(config))),
  );
  registerMockRoute("POST", "/designs/:id/assets", async (config) => {
    const file = blobPart(formOf(config), "file");
    if (!file) return respond(fileRejected("The file part is required"));
    return respond(
      await store.uploadAsset(id(config), file, undefined, headerOf(config, "Idempotency-Key")),
    );
  });
  registerMockRoute("GET", "/designs/:id/assets/:assetId/url", async (config) =>
    respond(await store.assetLink(id(config), param(config, "assetId"))),
  );

  /* ── Submitting and after ── */

  registerMockRoute("POST", "/designs/:id/submissions", async (config) =>
    respond(await store.submit(id(config), submissionOf(config))),
  );
  registerMockRoute("POST", "/designs/:id/preflight-failures", async (config) =>
    respond(await store.recordPreflightFailure(id(config), bodyOf(config))),
  );
  registerMockRoute("GET", "/designs/:id/files", async (config) =>
    respond(await store.files(id(config))),
  );
  registerMockRoute("POST", "/designs/:id/revisions", async (config) =>
    respond(await store.revise(id(config))),
  );

  /* ── Catalogue ── */

  registerMockRoute("GET", "/catalog/products/:slug/variants/:sku/print-config", async (config) =>
    respond(await store.printConfig(param(config, "slug"), param(config, "sku"))),
  );

  /* ── Reviewer simulation (mock only, spec §4.3) ── */

  registerMockRoute("POST", "/__mock/designs/:id/approve", async (config) =>
    respond(await store.simulateApprove(id(config))),
  );
  registerMockRoute("POST", "/__mock/designs/:id/return", async (config) =>
    respond(await store.simulateReturn(id(config), bodyOf(config))),
  );
  registerMockRoute("POST", "/__mock/reset", async () => respond(await store.reset()));
}

/**
 * Opens the design mock's storage (IndexedDB, memory when the browser refuses it), creates the
 * store and registers its routes: the one set-up path for the full mock and the design-only one.
 */
export async function setUpDesignMock(): Promise<DesignMockStore> {
  const store = await createDesignMockStore({ storage: await openDesignStorage() });
  registerDesignMockRoutes(store);
  return store;
}
