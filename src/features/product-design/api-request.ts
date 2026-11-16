// What every call of the design API (`api.ts`) shares: the abort signal, the design's path and
// the multipart settings of an upload.

export const withSignal = (signal?: AbortSignal) => (signal ? { signal } : {});
export const designPath = (id: string, tail = "") => `/designs/${encodeURIComponent(id)}${tail}`;

/** Up to 50 MB of file on a slow line: more than the 15 s a JSON call gets. */
const UPLOAD_TIMEOUT_MS = 120_000;
/** Without it the client's JSON default would make axios serialise the FormData to JSON. */
export const multipart = (headers: Record<string, string> = {}) => ({
  headers: { "Content-Type": "multipart/form-data", ...headers },
  timeout: UPLOAD_TIMEOUT_MS,
});

/** The pages of the app count from 1, the wire from 0. */
export const to0Based = (page: number) => Math.max(page, 1) - 1;
