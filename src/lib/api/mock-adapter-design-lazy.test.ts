import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { api } from "./client";
import { __resetMockAdapterForTests, activateMockAdapter } from "./mock-adapter";

// The design mock loads the design engine, which takes seconds in a test run. Here it never
// finishes loading: under the full mock, requests outside the design API must neither wait for it
// nor load it at all.
const design = vi.hoisted(() => ({ loads: 0 }));
vi.mock("./mock-design", () => {
  design.loads += 1;
  return new Promise(() => undefined);
});

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(Math, "random").mockReturnValue(0.5); // no simulated 5% error
});

afterEach(() => {
  __resetMockAdapterForTests();
  vi.restoreAllMocks();
});

it("under the full mock, a request outside the design API is answered without loading the design mock", async () => {
  activateMockAdapter();

  expect((await api.get("/customers/me")).status).toBe(200);
  expect((await api.get("/orders/me")).status).toBe(200);
  expect(design.loads).toBe(0);
});
