import { vi } from "vitest";

import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/error";
import type { MockCatalog } from "@/lib/api/mock-fixtures/catalog";
import type { MockOrderBook, MockResult } from "@/lib/api/mock-fixtures/orders";

/** What the response interceptor does with a mock result: unwrap `data`, or throw ApiError. */
export function settle(result: MockResult) {
  const body = result.data as Record<string, unknown>;
  if (result.status >= 400) {
    throw new ApiError(
      result.status,
      String(body.errorCode),
      String(body.message),
      body.fieldErrors as never,
      String(body.correlationId),
    );
  }
  return { data: body.data };
}

const query = (config: unknown) =>
  ((config as { params?: Record<string, unknown> } | undefined)?.params ?? {}) as Record<
    string,
    unknown
  >;

/**
 * Routes `api` calls to the BE-shaped fixtures, the way client.ts + the BE would answer. Anything
 * else (permissions, profile, addresses) answers `others` or 404.
 */
export function fakeBackend(deps: {
  catalog?: MockCatalog;
  orders?: () => MockOrderBook;
  others?: (url: string, config: unknown) => unknown;
}) {
  const { catalog, orders, others } = deps;
  vi.spyOn(api, "get").mockImplementation(async (url, config) => {
    const params = query(config);
    if (catalog) {
      if (url === "/catalog/products/availability") return settle(catalog.availability(params.sku));
      if (url === "/catalog/products/prices") return settle(catalog.prices(params.sku));
      if (url === "/catalog/products") return settle(catalog.list(params));
      if (url === "/catalog/search/suggestions") return settle(catalog.suggestions(params));
      const gallery = /^\/catalog\/products\/([^/]+)\/gallery$/.exec(url);
      if (gallery) return settle(catalog.gallery(decodeURIComponent(gallery[1]!)));
      const detail = /^\/catalog\/products\/([^/]+)$/.exec(url);
      if (detail) return settle(catalog.detail(decodeURIComponent(detail[1]!)));
    }
    if (orders) {
      if (url === "/orders/me") return settle(orders().page(params));
      if (url.startsWith("/orders/me/"))
        return settle(orders().get(url.replace("/orders/me/", "")));
    }
    const other = others?.(url, config);
    if (other !== undefined) return other as never;
    throw new ApiError(404, "NOT_FOUND", `No fake route for GET ${url}`);
  });
  vi.spyOn(api, "post").mockImplementation(async (url, body) => {
    if (orders && url === "/orders") return settle(orders().place(body as Record<string, unknown>));
    const cancel = /^\/orders\/([^/]+)\/cancellation$/.exec(url);
    if (orders && cancel) {
      return settle(orders().cancel(cancel[1]!, body as Record<string, unknown> | undefined));
    }
    throw new ApiError(404, "NOT_FOUND", `No fake route for POST ${url}`);
  });
}
