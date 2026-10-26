/**
 * Mock routes for the design studio: the BE design workflow (`/designs/**`, `DesignWorkflowController`
 * and `DesignController`) and the endpoints proposed in spec 2026-10-25 §7.2 (P1–P6,
 * `docs/superpowers/specs/2026-10-25-design-api-be-proposal.md`), served by the in-memory store of
 * `mock-fixtures/designs.ts`. Responses use the real ApiResponse envelope; the mock adapter rejects
 * error statuses so the client interceptor turns them into ApiError. Every path is distinct (a
 * `:param` never spans a `/`), so the order below only groups the routes by what they serve.
 */

import type { AxiosRequestConfig } from "axios";

import { registerMockRoute } from "./mock-adapter";
import { MOCK_CUSTOMER_ID } from "./mock-customer-addresses";
import { invalid } from "./mock-fixtures/design-model";
import {
  createMockDesignStudio,
  type MockDesignStudio,
  type MockResult,
} from "./mock-fixtures/designs";

/**
 * The mock customer's identity user for designs. A UUID, as the BE's `ownerUserId` is (the profile's
 * own `userId` in `mock-routes.ts` is not one); it differs from every id the seeded designs use.
 */
export const MOCK_DESIGN_USER_ID = "7d51f000-0000-4000-8000-0000000000d1";

/** Mock-only: how long the stand-in QC reviewer takes after a technical review request. */
export const MOCK_QC_DELAY_MS = 2000;
const MOCK_QC_NOTES = "Mock QC: đạt kỹ thuật";
/** BE `DesignController#upload`: `@RequestParam(defaultValue = "CUSTOMER_PREVIEW") role`. */
const DEFAULT_ARTIFACT_ROLE = "CUSTOMER_PREVIEW";

export interface DesignMockRouteOptions {
  /** Runs `run` once after `delayMs`; defaults to `setTimeout`, which fake timers replace in tests. */
  schedule?: (run: () => void, delayMs: number) => void;
}

const respond = (result: MockResult) => ({ status: result.status, data: result.data, headers: {} });

function pathParams(config: AxiosRequestConfig): Record<string, string> {
  return (
    (config as AxiosRequestConfig & { _mockParams?: Record<string, string> })._mockParams ?? {}
  );
}

const param = (config: AxiosRequestConfig, name: string) =>
  decodeURIComponent(pathParams(config)[name] ?? "");

function queryParams(config: AxiosRequestConfig): Record<string, unknown> {
  const raw: unknown = config.params;
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
}

function bodyOf(config: AxiosRequestConfig): Record<string, unknown> | undefined {
  const raw: unknown = typeof config.data === "string" ? safeParse(config.data) : config.data;
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : undefined;
}

const safeParse = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

/** A request header by name, ignoring case: axios hands the adapter an `AxiosHeaders`, tests a plain object. */
function headerOf(config: AxiosRequestConfig, name: string): string | undefined {
  const headers: unknown = config.headers;
  if (!headers || typeof headers !== "object") return undefined;
  const wanted = name.toLowerCase();
  const found = Object.entries(headers).find(([key]) => key.toLowerCase() === wanted)?.[1];
  return typeof found === "string" ? found : undefined;
}

/** The `file` part of a multipart body, or `undefined` when the body is not multipart or has none. */
function filePart(config: AxiosRequestConfig): Blob | undefined {
  const form = config.data as FormData | string | undefined;
  const part = typeof form === "object" && typeof form.get === "function" ? form.get("file") : null;
  return part instanceof Blob ? part : undefined;
}

const fileMissing = () =>
  invalid([{ field: "file", message: "the file part is required", code: "NotNull" }]);

const draftVersion = (result: MockResult): number | undefined => {
  const version = (result.data as { data?: { version?: unknown } } | undefined)?.data?.version;
  return typeof version === "number" ? version : undefined;
};

/** The studio of the mock customer, over the seeded catalogue; `registerAllMockRoutes` passes its own. */
const defaultStudio = () =>
  createMockDesignStudio({ userId: MOCK_DESIGN_USER_ID, customerId: MOCK_CUSTOMER_ID });

export function registerDesignMockRoutes(
  studio: MockDesignStudio = defaultStudio(),
  {
    schedule = (run, delayMs) => {
      setTimeout(run, delayMs);
    },
  }: DesignMockRouteOptions = {},
): void {
  /* ── Designs ── */

  // P1: the customer starts a design (the BE's own POST /designs is staff-only).
  registerMockRoute("POST", "/designs/mine", async (config) =>
    respond(await studio.create(bodyOf(config))),
  );
  registerMockRoute("GET", "/designs", (config) => respond(studio.list(queryParams(config))));
  registerMockRoute("GET", "/designs/:id", (config) => respond(studio.get(param(config, "id"))));
  registerMockRoute("GET", "/designs/:id/history", (config) =>
    respond(studio.history(param(config, "id"), queryParams(config))),
  );
  registerMockRoute("GET", "/designs/:id/snapshot", (config) =>
    respond(studio.snapshot(param(config, "id"))),
  );

  // P3: the design document, at the draft's version.
  registerMockRoute("GET", "/designs/:id/document", (config) =>
    respond(studio.getDocument(param(config, "id"))),
  );
  registerMockRoute("PUT", "/designs/:id/document", async (config) =>
    respond(await studio.putDocument(param(config, "id"), bodyOf(config))),
  );

  // P4: customer images (multipart `file`, `Idempotency-Key`).
  registerMockRoute("GET", "/designs/:id/assets", (config) =>
    respond(studio.listAssets(param(config, "id"))),
  );
  registerMockRoute("POST", "/designs/:id/assets", async (config) => {
    const file = filePart(config);
    if (!file) return respond(fileMissing());
    return respond(
      await studio.uploadAsset(param(config, "id"), file, headerOf(config, "Idempotency-Key")),
    );
  });
  registerMockRoute("GET", "/designs/:id/assets/:assetId/download-url", (config) =>
    respond(studio.assetLink(param(config, "id"), param(config, "assetId"))),
  );

  // Artifacts: the role rides in `?role=`.
  registerMockRoute("GET", "/designs/:id/artifacts", (config) =>
    respond(studio.listArtifacts(param(config, "id"))),
  );
  registerMockRoute("POST", "/designs/:id/artifacts", async (config) => {
    const file = filePart(config);
    if (!file) return respond(fileMissing());
    const role = String(queryParams(config).role ?? DEFAULT_ARTIFACT_ROLE);
    return respond(
      await studio.uploadArtifact(
        param(config, "id"),
        role,
        file,
        headerOf(config, "Idempotency-Key"),
      ),
    );
  });
  registerMockRoute("GET", "/designs/:id/artifacts/:artifactId/download-url", (config) =>
    respond(studio.artifactLink(param(config, "id"), param(config, "artifactId"))),
  );

  /* ── Workflow ── */

  registerMockRoute("PUT", "/designs/:id/specification", (config) =>
    respond(studio.revise(param(config, "id"), bodyOf(config))),
  );

  // P5: the customer is done and QC should look.
  registerMockRoute("POST", "/designs/:id/technical-review-requests", (config) => {
    const id = param(config, "id");
    const result = studio.requestReview(id, bodyOf(config));
    const requested = draftVersion(result);
    if (result.status < 300 && requested !== undefined) {
      // MOCK-ONLY: the QC reviewer is not part of the storefront, so the mock passes the review
      // after 2 s and a demo can go end to end. Any change since the request (edit, upload) has
      // voided it, as on the BE, so the answer is then dropped instead of passing what QC never saw.
      schedule(() => {
        if (draftVersion(studio.get(id)) === requested) {
          studio.completeReview(id, true, MOCK_QC_NOTES);
        }
      }, MOCK_QC_DELAY_MS);
    }
    return respond(result);
  });
  registerMockRoute("POST", "/designs/:id/confirmation-requests", (config) =>
    respond(studio.submit(param(config, "id"), bodyOf(config))),
  );
  registerMockRoute("POST", "/designs/:id/change-requests", (config) =>
    respond(studio.requestChanges(param(config, "id"), bodyOf(config))),
  );
  registerMockRoute("POST", "/designs/:id/confirmation-withdrawals", (config) =>
    respond(studio.withdraw(param(config, "id"), bodyOf(config))),
  );
  registerMockRoute("POST", "/designs/:id/confirmations", async (config) =>
    respond(await studio.confirm(param(config, "id"), bodyOf(config))),
  );
  registerMockRoute("POST", "/designs/:id/revisions", (config) =>
    respond(studio.fork(param(config, "id"))),
  );

  /* ── Catalogue ── */

  // P2: the templates of a product (a longer path than the catalogue's own `/catalog/products/:slug`).
  registerMockRoute("GET", "/catalog/products/:slug/customization", (config) =>
    respond(studio.customization(param(config, "slug"))),
  );
}
