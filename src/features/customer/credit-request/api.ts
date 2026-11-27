import { api } from "@/lib/api/client";

import {
  creditRequestFileSchema,
  creditRequestPageSchema,
  creditRequestSchema,
  downloadLinkSchema,
} from "./schemas";

import type { CreditRequest, CreditRequestFile, CreditRequestInput } from "./schemas";

/** The customer's own credit requests (BE `CreditRequestController`, `/credit-requests`). */
const BASE = "/credit-requests";
const path = (id: string, suffix = "") => `${BASE}/${encodeURIComponent(id)}${suffix}`;

/** GET /credit-requests/mine — newest first. */
export async function listMyCreditRequests(page = 0, size = 10, signal?: AbortSignal) {
  const { data } = await api.get<unknown>(`${BASE}/mine`, {
    params: { page, size },
    ...(signal ? { signal } : {}),
  });
  return creditRequestPageSchema.parse(data);
}

/** Another customer's request is a 404 (CREDIT_REQUEST_NOT_FOUND). */
export async function getCreditRequest(id: string, signal?: AbortSignal): Promise<CreditRequest> {
  const { data } = await api.get<unknown>(path(id), signal ? { signal } : {});
  return creditRequestSchema.parse(data);
}

/** POST /credit-requests from the portal: for the signed-in customer only → SUBMITTED. */
export async function submitCreditRequest(input: CreditRequestInput): Promise<CreditRequest> {
  const { data } = await api.post<unknown>(BASE, input);
  return creditRequestSchema.parse(data);
}

export async function withdrawCreditRequest(input: {
  id: string;
  version: number;
}): Promise<CreditRequest> {
  const { data } = await api.post<unknown>(path(input.id, "/withdrawal"), {
    version: input.version,
  });
  return creditRequestSchema.parse(data);
}

/** Attach one document as the multipart part `file` while the request is open. */
export async function attachCreditRequestFile(input: {
  id: string;
  file: File;
}): Promise<CreditRequestFile> {
  const form = new FormData();
  form.append("file", input.file);
  // The client defaults to JSON: without this axios would serialize the FormData and lose the file.
  const { data } = await api.post<unknown>(path(input.id, "/files"), form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return creditRequestFileSchema.parse(data);
}

export async function getCreditRequestFileUrl(id: string, fileId: string): Promise<string> {
  const { data } = await api.get<unknown>(
    path(id, `/files/${encodeURIComponent(fileId)}/download-url`),
  );
  return downloadLinkSchema.parse(data).url;
}
