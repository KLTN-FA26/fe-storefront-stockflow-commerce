/**
 * Mock routes for the BE B2B catalogue: /catalog/products, /catalog/products/{slug}[/gallery],
 * /catalog/products/{availability,prices} and /catalog/search/suggestions. Responses use the real
 * ApiResponse envelope; the mock adapter rejects error statuses so the client interceptor turns
 * them into ApiError. Routes with fixed words are registered before `/:slug` (first match wins).
 */

import type { AxiosRequestConfig } from "axios";

import { registerMockRoute } from "./mock-adapter";
import {
  createMockCatalog,
  seedMockCatalog,
  type MockCatalog,
  type MockResult,
} from "./mock-fixtures/catalog";

const respond = (result: MockResult) => ({
  status: result.status,
  data: result.data,
  headers: result.headers ?? {},
});

function pathParams(config: AxiosRequestConfig): Record<string, string> {
  return (
    (config as AxiosRequestConfig & { _mockParams?: Record<string, string> })._mockParams ?? {}
  );
}

function queryParams(config: AxiosRequestConfig): Record<string, unknown> {
  const raw: unknown = config.params;
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
}

export function registerCatalogMockRoutes(
  catalog: MockCatalog = createMockCatalog(seedMockCatalog()),
): void {
  registerMockRoute("GET", "/catalog/products/availability", (config) =>
    respond(catalog.availability(queryParams(config).sku)),
  );
  registerMockRoute("GET", "/catalog/products/prices", (config) =>
    respond(catalog.prices(queryParams(config).sku)),
  );
  registerMockRoute("GET", "/catalog/products", (config) =>
    respond(catalog.list(queryParams(config))),
  );
  registerMockRoute("GET", "/catalog/products/:slug/gallery", (config) =>
    respond(catalog.gallery(pathParams(config).slug ?? "")),
  );
  registerMockRoute("GET", "/catalog/products/:slug", (config) =>
    respond(catalog.detail(decodeURIComponent(pathParams(config).slug ?? ""))),
  );
  registerMockRoute("GET", "/catalog/search/suggestions", (config) =>
    respond(catalog.suggestions(queryParams(config))),
  );
}
