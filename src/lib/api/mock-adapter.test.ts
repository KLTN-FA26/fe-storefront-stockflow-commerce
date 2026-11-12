import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import type { InternalAxiosRequestConfig } from "axios";

import { api } from "./client";
import { ApiError } from "./error";
import {
  __resetMockAdapterForTests,
  activateDesignMockAdapter,
  activateMockAdapter,
  isDesignMockPath,
} from "./mock-adapter";
import { setUpDesignMock } from "./mock-design";
import type * as MockDesign from "./mock-design";
import { registerAllMockRoutes } from "./mock-routes";
import type * as MockRoutes from "./mock-routes";

// The real route table and design mock, with spies on how many times the full mock set up its
// routes, and how many times a design mock (its routes and store) was set up.
vi.mock("./mock-routes", async (importOriginal) => {
  const actual = await importOriginal<typeof MockRoutes>();
  return { ...actual, registerAllMockRoutes: vi.fn(actual.registerAllMockRoutes) };
});
vi.mock("./mock-design", async (importOriginal) => {
  const actual = await importOriginal<typeof MockDesign>();
  return { ...actual, setUpDesignMock: vi.fn(actual.setUpDesignMock) };
});

const originalAdapter = api.defaults.adapter;
const UNKNOWN_DESIGN = "5e5e0000-0000-4000-8000-000000000bad";
let info: MockInstance<typeof console.info>;

beforeEach(() => {
  info = vi.spyOn(console, "info").mockImplementation(() => {});
  // jsdom has no IndexedDB: the design mock says once that it keeps its data in memory.
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  __resetMockAdapterForTests();
  vi.restoreAllMocks();
});

/** An adapter standing for the BE: answers `{ real: true }` to everything. */
const backend = () =>
  vi.fn((config: InternalAxiosRequestConfig) =>
    Promise.resolve({ status: 200, statusText: "OK", data: { real: true }, headers: {}, config }),
  );

describe("mock adapter settles like a real HTTP adapter", () => {
  beforeEach(() => activateMockAdapter());

  it("resolves 2xx handler responses", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);

    const response = await api.get("/customers/me");

    expect(response.status).toBe(200);
  });

  it("rejects a 409 handler response as ApiError with the BE error fields", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);

    const error = await api
      .put("/customers/me", { fullName: "Tên", phone: null, version: 999 })
      .catch((err: unknown) => err);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 409,
      code: "OPTIMISTIC_LOCK",
      correlationId: "mock-customer-conflict",
    });
  });

  it("rejects the simulated random server error", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.01);

    const error = await api.get("/customers/me").catch((err: unknown) => err);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 500, code: "MOCK_RANDOM_ERROR" });
  });

  it("keeps the random server error for design requests in the full mock", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.01);

    const error = await api.get("/designs/draft-count").catch((err: unknown) => err);

    expect(error).toMatchObject({ status: 500, code: "MOCK_RANDOM_ERROR" });
  });

  it("rejects an unmatched route with 404", async () => {
    const error = await api.get("/does-not-exist").catch((err: unknown) => err);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 404 });
  });

  it("matches a non-design URL as it always did: its path with the query string dropped, nothing else", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);

    expect((await api.get("/customers/me?view=full")).status).toBe(200);
    for (const url of [
      "http://localhost:3000/customers/me",
      "http://localhost:3000/api/customers/me",
      "/api/customers/me",
      "/api/v1/customers/me",
    ]) {
      const error = await api.get(url).catch((err: unknown) => err);
      expect(error).toMatchObject({ status: 404 });
    }
  });

  it("matches a design URL under the client's /api base or the BE's /api/v1, relative or absolute", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);

    for (const url of [
      "/api/designs/draft-count",
      "http://localhost:3000/api/designs/draft-count",
      "https://be.example.vn/api/v1/designs/draft-count?x=1",
    ]) {
      expect((await api.get(url)).data).toEqual({ drafts: 2, limit: 50 });
    }
  });
});

describe("activateMockAdapter", () => {
  it("a second call (React StrictMode) activates nothing new: one route table, one design store, one log", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const register = vi.mocked(registerAllMockRoutes);
    register.mockClear();

    activateMockAdapter();
    const adapter = api.defaults.adapter;
    activateMockAdapter();

    expect(api.defaults.adapter).toBe(adapter);
    expect((await api.get("/customers/me")).status).toBe(200); // the route table is ready
    expect(register).toHaveBeenCalledTimes(1);
    expect(info).toHaveBeenCalledTimes(1);
  });

  it("sets the design mock up on the first design request only, and answers design requests from it", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const setUp = vi.mocked(setUpDesignMock);
    setUp.mockClear();

    activateMockAdapter();
    expect((await api.get("/customers/me")).status).toBe(200);
    expect(setUp).not.toHaveBeenCalled();

    expect((await api.get("/designs/draft-count")).data).toEqual({ drafts: 2, limit: 50 });
    expect((await api.get("/designs")).data).toMatchObject({ totalElements: 4 });
    expect(setUp).toHaveBeenCalledTimes(1);
  });

  it("with the design-only activation as well, the page still has one design mock (one store)", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const setUp = vi.mocked(setUpDesignMock);
    setUp.mockClear();

    activateMockAdapter();
    activateDesignMockAdapter();
    expect((await api.get("/designs/draft-count")).data).toEqual({ drafts: 2, limit: 50 });
    expect((await api.get("/customers/me")).status).toBe(200);
    expect((await api.get("/designs/draft-count")).data).toEqual({ drafts: 2, limit: 50 });

    expect(setUp).toHaveBeenCalledTimes(1);
  });

  it("__resetMockAdapterForTests puts the adapter back and lets a mock activate again", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    activateMockAdapter();
    await api.get("/customers/me");
    expect(api.defaults.adapter).not.toBe(originalAdapter);

    __resetMockAdapterForTests();
    expect(api.defaults.adapter).toBe(originalAdapter);

    activateMockAdapter();
    expect(api.defaults.adapter).not.toBe(originalAdapter);
    expect((await api.get("/customers/me")).status).toBe(200);
  });
});

describe("isDesignMockPath", () => {
  it.each([
    "/designs",
    "/designs/x/document",
    "/catalog/products/ly-a/variants/SKU1/print-config",
    "/__mock/reset",
    "/api/v1/designs?page=0",
    "/api/designs/x/document",
    "http://localhost:3000/designs/x/document",
    "http://localhost:3000/api/designs/x/document",
    "https://be.example.vn/api/v1/designs?page=0",
    "https://be.example.vn/__mock/reset#top",
  ])("is true for %s", (url) => {
    expect(isDesignMockPath(url)).toBe(true);
  });

  it.each([
    "/catalog/products/ly-a",
    "/designs-old",
    "/orders/me",
    "/api/v1/orders/me",
    "/api/orders/me",
    "/api/v2/designs",
    "http://localhost:3000/orders/me",
    "http://localhost:3000/api/orders/me",
    "https://designs.example.vn/orders/me",
    "https://be.example.vn/designs-old",
    undefined,
  ])("is false for %s", (url) => {
    expect(isDesignMockPath(url)).toBe(false);
  });
});

describe("activateDesignMockAdapter", () => {
  it("sends /designs to the mock and /catalog/products to the previous adapter", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const previous = backend();
    api.defaults.adapter = previous;

    activateDesignMockAdapter();
    const wrapper = api.defaults.adapter;
    activateDesignMockAdapter(); // StrictMode runs the initializer twice: no second wrap
    expect(api.defaults.adapter).toBe(wrapper);

    const real = await api.get("/catalog/products/ly-a");
    expect(real.data).toEqual({ real: true });
    expect(previous).toHaveBeenCalledTimes(1);

    // Answered by the design mock's own seeded store and route table, not by the previous adapter.
    expect((await api.get("/designs/draft-count")).data).toEqual({ drafts: 2, limit: 50 });
    const missing = await api.get(`/designs/${UNKNOWN_DESIGN}`).catch((err: unknown) => err);
    expect(missing).toBeInstanceOf(ApiError);
    expect(missing).toMatchObject({ status: 404, code: "NOT_FOUND" });
    expect(previous).toHaveBeenCalledTimes(1);
  });

  it("an absolute design URL is answered by the mock; an absolute other URL reaches the previous adapter", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const previous = backend();
    api.defaults.adapter = previous;
    activateDesignMockAdapter();

    for (const url of [
      "http://localhost:3000/designs/draft-count",
      "http://localhost:3000/api/designs/draft-count",
      "http://localhost:3000/api/v1/designs/draft-count",
    ]) {
      expect((await api.get(url)).data).toEqual({ drafts: 2, limit: 50 });
    }
    const other = await api.get("http://localhost:3000/api/orders/me?page=1");
    expect(other.data).toEqual({ real: true });
    expect(previous).toHaveBeenCalledTimes(1);
    // Handed on exactly as the caller wrote it.
    expect(previous.mock.calls[0]![0].url).toBe("http://localhost:3000/api/orders/me?page=1");
  });

  // Ruling R17: Module 12 ships on the design-only mock, and its writes are not retried.
  it("never fails a design request at random, whatever Math.random says", async () => {
    // Below the full mock's 5% threshold: the full mock would answer 500 MOCK_RANDOM_ERROR here.
    vi.spyOn(Math, "random").mockReturnValue(0.01);
    activateDesignMockAdapter();

    const response = await api.get("/designs/draft-count");

    expect(response.status).toBe(200);
    expect(response.data).toMatchObject({ limit: 50 });
  });
});
