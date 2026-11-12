/**
 * Mock adapter for axios, in one of two modes chosen by `AppProviders` (no env var is read here):
 *
 *  - `activateMockAdapter()`, when `USE_MOCK=true` (server-only flag, see `src/lib/config.ts`):
 *    every request resolves against the mock route table — simulating server-side pagination,
 *    filtering, sorting, latency, and an occasional random 500 (`MOCK_RANDOM_ERROR`).
 *  - `activateDesignMockAdapter()`, otherwise while `DESIGN_API_MOCKED`: only the design API
 *    (spec 2026-11-09 §5) is served by the mock, with latency but never a random 500; every other
 *    request reaches the BE.
 *
 * Either way the design mock (`mock-design.ts`, which loads the design engine) is set up once per
 * page by `designMockReady`: by the design-only activation, or under the full mock on the first
 * design request, so no other request waits for it.
 *
 * **Only this file may import mock-data.ts** — enforced by CI grep.
 */

import * as MOCK_DATA from "@/lib/mock-data";

import axios, {
  AxiosError,
  type AxiosAdapter,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from "axios";
import { api } from "./client";

/* ── Types ───────────────────────────────────────────────────────────── */

interface MockResponse<T = unknown> {
  status: number;
  data: T;
  headers: Record<string, string>;
}

type RouteHandler = (config: AxiosRequestConfig) => Promise<MockResponse> | MockResponse;

export { MOCK_DATA };

/* ── Route registry ──────────────────────────────────────────────────── */

const routes = new Map<string, Map<string, RouteHandler>>();

export function registerMockRoute(method: string, pattern: string, handler: RouteHandler): void {
  const methodUpper = method.toUpperCase();
  if (!routes.has(methodUpper)) routes.set(methodUpper, new Map());
  routes.get(methodUpper)!.set(pattern, handler);
}

/* ── Helpers ─────────────────────────────────────────────────────────── */

/** Random delay between 200–500ms to simulate network latency. */
const delay = (ms?: number) =>
  new Promise<void>((r) => setTimeout(r, ms ?? 200 + Math.random() * 300));

/** Paginate an array server-style. */
export function paginate<T>(
  items: T[],
  page = 1,
  pageSize = 15,
): { items: T[]; total: number; page: number; pageSize: number } {
  const start = (page - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    total: items.length,
    page,
    pageSize,
  };
}

/* ── Match URL to registered pattern ─────────────────────────────────── */

/** The design API the design mock serves (spec 2026-11-09 §5), as a path of the route table. */
const DESIGN_PATH =
  /^(?:\/designs(?:\/.*)?|\/catalog\/products\/[^/]+\/variants\/[^/]+\/print-config|\/__mock(?:\/.*)?)$/;

/**
 * A design URL as the route table knows it, null for any other: without an origin
 * (`https://host`), the client's `/api` base (`client.ts`, rewritten to the BE by `next.config.ts`)
 * or the BE's `/api/v1`, a query string or a fragment — so a relative, a prefixed and an absolute
 * URL of one design endpoint reach the same route.
 */
function designRoutePath(url: string): string | null {
  const path = url
    .replace(/^[a-z][a-z\d+.-]*:\/\/[^/?#]*/i, "")
    .replace(/[?#].*$/, "")
    .replace(/^\/api(?:\/v1)?(?=\/|$)/, "");
  return DESIGN_PATH.test(path) ? path : null;
}

/** The path a URL is matched by: a design URL's own (above); any other with its query dropped. */
const routePath = (url: string) => designRoutePath(url) ?? url.replace(/\?.*$/, "");

function matchRoute(
  method: string,
  url: string,
): { handler: RouteHandler; params: Record<string, string> } | null {
  const methodRoutes = routes.get(method.toUpperCase());
  if (!methodRoutes) return null;

  const path = routePath(url);
  for (const [pattern, handler] of methodRoutes) {
    const regex = new RegExp("^" + pattern.replace(/:(\w+)/g, "(?<$1>[^/]+)") + "$");
    const match = path.match(regex);
    if (match) return { handler, params: match.groups ?? {} };
  }
  return null;
}

/* ── Settle ──────────────────────────────────────────────────────────── */

/**
 * Reject non-2xx like axios' built-in adapters do (custom adapters must settle themselves),
 * so the client's error interceptor turns mock error bodies into ApiError.
 */
function settle(config: AxiosRequestConfig, res: MockResponse): MockResponse {
  if (res.status >= 200 && res.status < 300) return res;
  const body = res.data as { message?: unknown } | null | undefined;
  const message =
    typeof body?.message === "string"
      ? body.message
      : `Request failed with status code ${res.status}`;
  const internal = config as InternalAxiosRequestConfig;
  throw new AxiosError(
    message,
    res.status >= 500 ? AxiosError.ERR_BAD_RESPONSE : AxiosError.ERR_BAD_REQUEST,
    internal,
    null,
    { status: res.status, statusText: "", data: res.data, headers: res.headers, config: internal },
  );
}

/* ── Adapter ─────────────────────────────────────────────────────────── */

/**
 * Resolves once `registerAllMockRoutes()` has run. `activateMockAdapter()`
 * sets this before any request can reach `mockAdapter` (see below) — the
 * adapter itself awaits it, closing the race where a request fired before
 * the dynamic import of `./mock-routes` finished would find no routes
 * registered yet and get a bogus 404. Design requests wait for `designMock`
 * instead: the route table of `./mock-routes` has no design routes.
 */
let routesReady: Promise<void> | undefined;

/** The page's design mock, set up once by `designMockReady`. */
let designMock: Promise<void> | undefined;

/** Whether design routes are registered: the page's own, or those of a test's own store. */
const hasDesignRoutes = () =>
  [...routes.values()].some((byPattern) =>
    [...byPattern.keys()].some((pattern) => DESIGN_PATH.test(pattern)),
  );

/**
 * Sets the design mock up once per page, whichever activation asks first: loads `./mock-design`
 * (and with it the design engine), then registers its routes over a new store — unless design
 * routes are registered already, as a test does over a store of its own. A store that fails to
 * start is logged there, and its routes answer 503.
 */
function designMockReady(): Promise<void> {
  designMock ??= import("./mock-design").then(({ setUpDesignMock }) => {
    if (!hasDesignRoutes()) setUpDesignMock().catch(() => undefined);
  });
  return designMock;
}

type MockAdapterOptions = {
  /**
   * A 5% chance of a 500 `MOCK_RANDOM_ERROR` before the handler runs (resilience testing in the
   * full mock). Off for the design-only mock: Module 12 ships on it, and mutations do not retry.
   */
  randomErrors: boolean;
};

async function mockAdapter(
  config: AxiosRequestConfig,
  { randomErrors }: MockAdapterOptions = { randomErrors: true },
): Promise<MockResponse> {
  const url = config.url ?? "/";
  const method = (config.method ?? "GET").toUpperCase();

  // A design request waits for the design mock only, any other for the route table only.
  if (isDesignMockPath(url)) await designMockReady();
  else if (routesReady) await routesReady;

  const matched = matchRoute(method, url);
  if (!matched) {
    console.warn(`[mock-adapter] No handler for ${method} ${url}`);
    return settle(config, { status: 404, data: { message: "Not found" }, headers: {} });
  }

  // Simulate latency
  await delay();

  // 5% random server error for resilience testing
  if (randomErrors && Math.random() < 0.05) {
    return settle(config, {
      status: 500,
      data: {
        errorCode: "MOCK_RANDOM_ERROR",
        message: "Lỗi ngẫu nhiên từ mock server (5% chance)",
        correlationId: `mock-${Date.now()}`,
      },
      headers: {},
    });
  }

  // Inject URL params into config for handlers to use
  (config as AxiosRequestConfig & { _mockParams: Record<string, string> })._mockParams =
    matched.params;

  return settle(config, await matched.handler(config));
}

/* ── Activate ────────────────────────────────────────────────────────── */

/** The adapter in place before any mock: what `__resetMockAdapterForTests` puts back. */
const adapterBeforeMock = api.defaults.adapter;
let mockActive = false;

/**
 * Serves every request from the mock route table; design requests from the design mock, set up
 * on the first of them (`designMockReady`). Calling it again is a no-op (React StrictMode runs the
 * provider's initializer twice): one route table per page.
 */
export function activateMockAdapter(): void {
  if (mockActive) return;
  mockActive = true;

  // Register all mock routes before activating the adapter. The dynamic
  // import is async even though the module is already bundled, so the
  // adapter must await `routesReady` (set below) rather than assume routes
  // exist by the time the first request arrives.
  routesReady = import("./mock-routes").then(({ registerAllMockRoutes }) => {
    registerAllMockRoutes();
  });

  const served: AxiosAdapter = (config) => mockAdapter(config) as ReturnType<AxiosAdapter>;
  api.defaults.adapter = served;
  console.info("[mock-adapter] Activated — all API calls will be served from mock-data.ts");
}

/* ── Design-only mock (Module 12) ────────────────────────────────────── */

/**
 * Whether a request URL belongs to the design API the mock serves: relative, under `/api` or
 * `/api/v1`, or absolute (origin, query string and fragment ignored).
 */
export function isDesignMockPath(url: string | undefined): boolean {
  return url !== undefined && designRoutePath(url) !== null;
}

let designMockActive = false;

/**
 * Serves only the design API from the mock; every other request keeps the adapter that was in
 * place. Design requests get the mock's latency but never its random 500: this is how Module 12
 * runs in a real build (ruling R17). Calling it again is a no-op (React StrictMode runs the
 * provider's initializer twice).
 */
export function activateDesignMockAdapter(): void {
  if (designMockActive) return;
  designMockActive = true;

  // Set up now (design requests wait for it); the same design mock as the full mock's, if both run.
  designMockReady().catch(() => undefined);

  const realAdapter = axios.getAdapter(api.defaults.adapter ?? axios.defaults.adapter);
  const routed: AxiosAdapter = (config) =>
    isDesignMockPath(config.url)
      ? (mockAdapter(config, { randomErrors: false }) as ReturnType<AxiosAdapter>)
      : realAdapter(config);
  api.defaults.adapter = routed;
  console.info("[mock-adapter] Activated for the design API only — other calls reach the BE");
}

/* ── Tests ───────────────────────────────────────────────────────────── */

/**
 * Test-only: forgets every activation — the flags, the registered routes, the adapter it put in
 * place — as on a page that never activated a mock, so the next test activates from scratch.
 * Call it once the requests of the test have settled (a pending route set-up would land after it).
 */
export function __resetMockAdapterForTests(): void {
  mockActive = false;
  designMockActive = false;
  routesReady = undefined;
  designMock = undefined;
  routes.clear();
  if (adapterBeforeMock) api.defaults.adapter = adapterBeforeMock;
  else delete api.defaults.adapter;
}
