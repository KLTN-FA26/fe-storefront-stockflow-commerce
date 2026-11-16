/**
 * What a mock design route reads of its request, and the shape of its answer: shared by
 * `mock-design.ts` (designs, files, clones, the reviewer simulation) and
 * `mock-design-projects.ts` (projects, their library, review rounds).
 */

import type { AxiosRequestConfig } from "axios";

import type { MockResult } from "./mock-fixtures/design-rows";

export const respond = (result: MockResult) => ({
  status: result.status,
  data: result.data,
  headers: {},
});

/** A path parameter of the route pattern, decoded. */
export const param = (config: AxiosRequestConfig, name: string) => {
  const params = (config as AxiosRequestConfig & { _mockParams?: Record<string, string> })
    ._mockParams;
  return decodeURIComponent(params?.[name] ?? "");
};

export function queryParams(config: AxiosRequestConfig): Record<string, unknown> {
  const raw: unknown = config.params;
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
}

export const parseJson = (text: string | undefined): unknown => {
  if (text === undefined) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

/** A JSON body: axios hands the adapter the serialised string. */
export const bodyOf = (config: AxiosRequestConfig): unknown =>
  typeof config.data === "string" ? parseJson(config.data) : config.data;

/** A request header by name, ignoring case: axios hands the adapter an `AxiosHeaders`, tests a plain object. */
export function headerOf(config: AxiosRequestConfig, name: string): string | undefined {
  const headers: unknown = config.headers;
  if (!headers || typeof headers !== "object") return undefined;
  const wanted = name.toLowerCase();
  const found = Object.entries(headers).find(([key]) => key.toLowerCase() === wanted)?.[1];
  return typeof found === "string" ? found : undefined;
}

/** A multipart body (duck-typed: the FormData may come from another realm in tests). */
export function formOf(config: AxiosRequestConfig): FormData | undefined {
  const data: unknown = config.data;
  return typeof data === "object" && data !== null && typeof (data as FormData).get === "function"
    ? (data as FormData)
    : undefined;
}

/** A Blob, duck-typed like `formOf`: one from another realm is not `instanceof Blob` here. */
function isBlobLike(value: unknown): value is Blob {
  if (typeof value !== "object" || value === null) return false;
  const blob = value as Partial<Record<keyof Blob, unknown>>;
  return (
    typeof blob.arrayBuffer === "function" &&
    typeof blob.size === "number" &&
    typeof blob.type === "string"
  );
}

export const blobPart = (form: FormData | undefined, name: string) => {
  const part: unknown = form?.get(name);
  return isBlobLike(part) ? part : undefined;
};
