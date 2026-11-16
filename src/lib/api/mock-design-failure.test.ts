import { afterEach, beforeEach, expect, it, vi, type MockInstance } from "vitest";

import { api } from "./client";
import { ApiError } from "./error";
import { __resetMockAdapterForTests, activateMockAdapter } from "./mock-adapter";
import { registerDesignMockRoutes } from "./mock-design";

// Outside a secure context (a phone opening http://192.168.x.x:3000) `crypto.subtle` is missing and
// seeding the design mock throws. The rest of the mock must keep working and design requests must
// answer an error instead of failing or hanging every request.
vi.mock("./mock-fixtures/design-seed", () => ({
  MOCK_DESIGN_IDS: {},
  seedDesignState: () => Promise.reject(new TypeError("crypto.subtle is undefined")),
}));

let errors: MockInstance<typeof console.error>;
let warnings: MockInstance<typeof console.warn>;

async function failure(request: Promise<unknown>) {
  const error = await request.catch((err: unknown) => err);
  expect(error).toBeInstanceOf(ApiError);
  return [(error as ApiError).status, (error as ApiError).code];
}

beforeEach(async () => {
  vi.spyOn(console, "info").mockImplementation(() => {});
  errors = vi.spyOn(console, "error").mockImplementation(() => {});
  warnings = vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(Math, "random").mockReturnValue(0.06); // no simulated 5% error, shortest latency
  activateMockAdapter();
  await api.get("/routes-ready-probe").catch(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
  __resetMockAdapterForTests();
  vi.restoreAllMocks();
});

it("a design mock that cannot seed answers 500 on design routes; every other mock route works", async () => {
  expect((await api.get("/customers/me")).status).toBe(200);
  expect((await api.get("/catalog/products")).status).toBe(200);
  expect((await api.get("/orders/me")).status).toBe(200);

  expect(await failure(api.get("/designs"))).toEqual([500, "DESIGN_MOCK_FAILED"]);
  expect(errors).toHaveBeenCalledWith(
    expect.stringContaining("[mock-design]"),
    expect.any(TypeError),
  );
});

it("design routes over a store that did not start answer 503", async () => {
  registerDesignMockRoutes(Promise.reject(new Error("no storage")));
  expect(await failure(api.get("/designs"))).toEqual([503, "DESIGN_MOCK_UNAVAILABLE"]);
});

it("design routes over a store still starting after 10 s answer 503, and say so in the console", async () => {
  vi.useFakeTimers();
  registerDesignMockRoutes(new Promise(() => undefined)); // an IndexedDB open that never settles

  const answer = failure(api.get("/designs"));
  await vi.advanceTimersByTimeAsync(9_000);
  expect(warnings).not.toHaveBeenCalledWith(expect.stringContaining("[mock-design]"));
  await vi.advanceTimersByTimeAsync(2_000);

  expect(await answer).toEqual([503, "DESIGN_MOCK_UNAVAILABLE"]);
  expect(warnings).toHaveBeenCalledWith(expect.stringContaining("[mock-design]"));
});
