/**
 * Mock routes of Module 12, served by the store of `mock-fixtures/design-store.ts`, and the
 * reviewer simulation under `/__mock`. Responses use the ApiResponse envelope; the mock adapter
 * turns error statuses into ApiError.
 *
 * Every route is at the BE's path and in its shapes, errors and statuses (`mock-fixtures/
 * design-be-contract.ts` for designs, files and clones, `design-be-projects.ts` for projects, the
 * library and review rounds turn the store's rows into them); only `/__mock` is the mock's own. The
 * store keeps its rows in the shape the front end first defined.
 * The first matching pattern wins, so literal paths (`/designs/mine`) come before `/designs/:id`.
 */

import type { AxiosRequestConfig } from "axios";

import { registerMockRoute } from "./mock-adapter";
import { registerProjectRoutes, cloneAnswer } from "./mock-design-projects";
import {
  blobPart,
  bodyOf,
  formOf,
  headerOf,
  param,
  queryParams,
  respond,
} from "./mock-design-request";
import {
  beDecision,
  beDraft,
  beHistoryPage,
  beSnapshot,
  productOfId,
  viaBe,
} from "./mock-fixtures/design-be-contract";
import { printConfigFor } from "./mock-fixtures/design-print-configs";
import {
  asRecord,
  fail,
  fileRejected,
  invalid,
  ok,
  type DesignDto,
  type DesignEventDto,
  type MockResult,
} from "./mock-fixtures/design-rows";
import { openDesignStorage } from "./mock-fixtures/design-storage";
import { createDesignMockStore, type DesignMockStore } from "./mock-fixtures/design-store";

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

  /* ── Designs and their lifecycle, in the BE's contract (SF1) ── */

  // The store's design (`DesignDto`) as the BE's `DesignDraftResponse`.
  const draft = (data: unknown) => {
    const design = data as DesignDto;
    return beDraft(design, printConfigFor(design.product.slug, design.variant.sku)?.template.code);
  };
  const drafts = (page: unknown) => {
    const body = asRecord(page);
    return { ...body, items: (Array.isArray(body.items) ? body.items : []).map(draft) };
  };
  const nothing = () => null;

  route("GET", "/designs", (s, config) => {
    const query = queryParams(config);
    const status = typeof query.status === "string" ? query.status.trim().toUpperCase() : "";
    // The BE lists a design that is not archived: that status, or an unknown one, is a 400.
    if (status === "ARCHIVED") {
      return Promise.resolve(
        fail(
          400,
          "UNSUPPORTED_PARAMETER",
          "status must be one of [DRAFT, PENDING_REVIEW, APPROVED]",
        ),
      );
    }
    return s.list({ ...query, ...(status ? { status } : {}) }).then((r) => viaBe(r, drafts));
  });
  route("POST", "/designs/mine", async (s, config) => {
    const body = asRecord(bodyOf(config));
    for (const field of ["productId", "sku", "templateCode"] as const) {
      const value = body[field];
      if (typeof value !== "string" || !value.trim()) {
        return viaBe(invalid(field, `${field} must not be blank`), nothing);
      }
    }
    const product = productOfId(body.productId);
    if (!product) return fail(404, "NOT_FOUND", "Product not found");
    const sku = String(body.sku).trim();
    const found = asRecord(asRecord((await s.printConfig(product.slug, sku)).data).data);
    if (asRecord(found.template).code !== body.templateCode) {
      return fail(404, "PRINT_CONFIG_NOT_FOUND", "Customization template not found");
    }
    const { projectId } = body;
    return viaBe(
      await s.create({ productSlug: product.slug, sku, name: body.name, projectId }),
      draft,
      {
        status: 201,
      },
    );
  });
  route("GET", "/designs/:id", async (s, config) => viaBe(await s.get(id(config)), draft));
  route("PUT", "/designs/:id/name", async (s, config) =>
    viaBe(await s.rename(id(config), bodyOf(config)), draft),
  );
  route("POST", "/designs/:id/archive", async (s, config) =>
    viaBe(await s.remove(id(config), bodyOf(config)), draft),
  );
  route("GET", "/designs/:id/history", async (s, config) => {
    const result = await s.history(id(config));
    return asRecord(result.data).success === true
      ? beHistoryPage(asRecord(result.data).data as DesignEventDto[], queryParams(config))
      : result;
  });
  route("GET", "/designs/:id/snapshot", async (s, config) => {
    const result = await s.snapshot(id(config));
    return asRecord(result.data).success === true
      ? beSnapshot(asRecord(result.data).data as DesignDto)
      : result;
  });
  // The layout: the BE's own shape (a stored layout keeps its own nulls: only the envelope's go).
  const record = (data: unknown) => data;
  route("GET", "/designs/:id/document", async (s, config) =>
    viaBe(await s.getDocument(id(config)), record, { shallow: true }),
  );
  route("PUT", "/designs/:id/document", async (s, config) =>
    viaBe(await s.putDocument(id(config), bodyOf(config)), record, {
      shallow: true,
      // The BE's word for a layout over 1,000,000 bytes.
      codes: { PAYLOAD_TOO_LARGE: { status: 413, code: "REQUEST_BODY_TOO_LARGE", bare: true } },
    }),
  );
  route("GET", "/designs/:id/template", async (s, config) =>
    viaBe(await s.designTemplate(id(config)), record),
  );

  /* ── Projects, their library and review rounds (`mock-design-projects.ts`) ── */

  registerProjectRoutes(route);

  /* ── Images ── */

  /* ── Quote requests (WF-02 D1, plan Phụ lục B A-1, A-3; `design-store-quotes.ts`) ── */

  // 201 a new request, 200 the open one asked again: the store's status goes out as it is.
  const asIs = (data: unknown) => data;
  route("POST", "/designs/:id/quote-requests", async (s, config) =>
    viaBe(await s.requestQuote(id(config), bodyOf(config)), asIs),
  );
  route("GET", "/designs/:id/quote-requests", async (s, config) =>
    viaBe(await s.designQuoteRequests(id(config)), asIs),
  );

  // The BE's contract (rows 12-15): refusals of a file are 415 / 413 with a message only.
  const asset = (data: unknown) => data;
  route("GET", "/designs/:id/assets", async (s, config) =>
    viaBe(await s.listAssets(id(config)), asset),
  );
  route("POST", "/designs/:id/assets", async (s, config) => {
    const file = blobPart(formOf(config), "file");
    if (!file) return viaBe(fileRejected("The file part is required"), asset);
    const key = headerOf(config, "Idempotency-Key");
    return viaBe(await s.uploadAsset(id(config), file, undefined, key), asset, { status: 201 });
  });
  route("POST", "/designs/:id/assets/library", async (s, config) => {
    const { assetId } = asRecord(bodyOf(config));
    if (typeof assetId !== "string" || !assetId.trim()) {
      return viaBe(invalid("assetId", "assetId must not be blank"), nothing);
    }
    // The library item's id is the file's `assetId` of the BE.
    const placed = await s.placeFromLibrary(id(config), { libraryItemId: assetId });
    return viaBe(placed, asset, { status: 201 });
  });
  route("GET", "/designs/:id/assets/:assetId/download-url", async (s, config) =>
    viaBe(await s.assetLink(id(config), param(config, "assetId")), asset),
  );

  /* ── Submitting and after ── */

  // The BE's flow of one design (F-19): its files one by one, then the request for review.
  const artifact = (data: unknown) => data;
  route("POST", "/designs/:id/artifacts", async (s, config) => {
    const query = queryParams(config);
    const uploaded = await s.uploadArtifact(id(config), {
      role: query.role,
      file: blobPart(formOf(config), "file"),
      documentChecksum: query.documentChecksum,
      key: headerOf(config, "Idempotency-Key"),
    });
    return viaBe(uploaded, artifact, { status: 201 });
  });
  route("GET", "/designs/:id/artifacts", async (s, config) =>
    viaBe(await s.listArtifacts(id(config)), artifact),
  );
  route("GET", "/designs/:id/artifacts/:artifactId/download-url", async (s, config) =>
    viaBe(await s.artifactLink(id(config), param(config, "artifactId")), artifact),
  );
  route("POST", "/designs/:id/technical-review-requests", async (s, config) =>
    viaBe(await s.requestReview(id(config), bodyOf(config)), draft),
  );
  // The studio's own refusal on the record (row 18): findings are `{rule, surfaceCode?, elementId?}`.
  route("POST", "/designs/:id/preflight-failures", async (s, config) => {
    const { version, issues } = asRecord(bodyOf(config));
    const reported = Array.isArray(issues) ? issues.map(asRecord) : [];
    if (
      reported.length < 1 ||
      reported.length > 50 ||
      reported.some((i) => typeof i.rule !== "string" || !i.rule.trim() || i.rule.length > 64)
    ) {
      return viaBe(invalid("issues", "1 to 50 findings, each with a rule"), nothing);
    }
    // The BE keeps the rule and where it is, and ignores any message.
    const kept = reported.map((i) => ({
      ruleId: i.rule,
      level: "fail",
      message: String(i.rule),
      surfaceCode: i.surfaceCode,
      elementId: i.elementId,
    }));
    const recorded = await s.recordPreflightFailure(id(config), { version, issues: kept });
    return viaBe(recorded, (event) => beDecision(event as DesignEventDto), { status: 201 });
  });
  route("POST", "/designs/:id/revisions", async (s, config) =>
    viaBe(await s.revise(id(config)), draft, {
      status: 200,
      // A revision of a design that is not approved is a plain conflict in the BE.
      codes: { INVALID_STATE: { status: 409, code: "CONFLICT" } },
    }),
  );
  // 201 `{design, notInProject?}`, the Idempotency-Key required (row 9).
  route("POST", "/designs/:id/clones", async (s, config) =>
    cloneAnswer(await s.clone(id(config), bodyOf(config), headerOf(config, "Idempotency-Key"))),
  );

  /* ── Catalogue ── */

  route("GET", "/catalog/products/:slug/customization", (s, config) => {
    const hint = queryParams(config).sku;
    return s.customization(param(config, "slug"), typeof hint === "string" ? hint : undefined);
  });

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
