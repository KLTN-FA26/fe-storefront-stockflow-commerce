import { z } from "zod";

import { api } from "@/lib/api/client";

import { designPath, withSignal } from "./api-request";
import { designQuoteRequestDtoSchema, projectQuoteRequestDtoSchema } from "./quote-request-schemas";
import type {
  DesignQuoteRequest,
  ProjectQuoteRequest,
  ProjectQuoteRequestInput,
  QuoteRequestInput,
  QuoteRequestOutcome,
} from "./types";

// A customer's quote requests (plan WF-02 Phụ lục B, area A; BE `DesignQuoteRequestController`,
// `DesignProjectController`), re-exported by `api.ts`. The card the sales chat shows is posted by
// the BE after commit (§B.7): nothing here talks to the chat.

const projectPath = (id: string, tail = "") => `/design-projects/${encodeURIComponent(id)}${tail}`;

/** 201: a new request; 200: the open one now asks this (the controllers' `asked.created()`). */
const CREATED = 201;

/** The body of a request: no date is no key (the BE reads a missing date as none). */
export const quoteRequestBody = (input: QuoteRequestInput) => ({
  cartons: input.cartons,
  ...(input.desiredDeliveryDate ? { desiredDeliveryDate: input.desiredDeliveryDate } : {}),
});

/**
 * A-1 `POST /designs/{id}/quote-requests` `{cartons, desiredDeliveryDate?}` — an APPROVED design
 * only (409 `DESIGN_NOT_APPROVED`). Asked again while one is open, that one changes and the answer
 * is 200, not 201.
 */
export async function requestDesignQuote(
  designId: string,
  input: QuoteRequestInput,
): Promise<QuoteRequestOutcome<DesignQuoteRequest>> {
  const response = await api.post<unknown>(
    designPath(designId, "/quote-requests"),
    quoteRequestBody(input),
  );
  return {
    request: designQuoteRequestDtoSchema.parse(response.data),
    created: response.status === CREATED,
  };
}

/** A-3 `GET /designs/{id}/quote-requests` — every request of the design, newest first, not paged. */
export async function listDesignQuoteRequests(
  designId: string,
  signal?: AbortSignal,
): Promise<DesignQuoteRequest[]> {
  const { data } = await api.get<unknown>(
    designPath(designId, "/quote-requests"),
    withSignal(signal),
  );
  return z.array(designQuoteRequestDtoSchema).parse(data);
}

/**
 * A-6 `POST /design-projects/{id}/quote-requests` `{lines: [{designId, cartons}], desiredDeliveryDate?}`
 * — 1 to 20 APPROVED designs of the project, one date for all. 200 while a request of the project
 * is open (the same ask changes nothing; another one replaces its lines and date). 409
 * `DESIGN_PROJECT_ARCHIVED` once the project is closed. There is no "submit and ask" for a project
 * (docs 12 §4.11.36).
 */
export async function requestProjectQuote(
  projectId: string,
  input: ProjectQuoteRequestInput,
): Promise<QuoteRequestOutcome<ProjectQuoteRequest>> {
  const response = await api.post<unknown>(projectPath(projectId, "/quote-requests"), {
    lines: input.lines.map((line) => ({ designId: line.designId, cartons: line.cartons })),
    ...(input.desiredDeliveryDate ? { desiredDeliveryDate: input.desiredDeliveryDate } : {}),
  });
  return {
    request: projectQuoteRequestDtoSchema.parse(response.data),
    created: response.status === CREATED,
  };
}

/** A-7 `GET /design-projects/{id}/quote-requests` — the project's requests, newest first (owner only). */
export async function listProjectQuoteRequests(
  projectId: string,
  signal?: AbortSignal,
): Promise<ProjectQuoteRequest[]> {
  const { data } = await api.get<unknown>(
    projectPath(projectId, "/quote-requests"),
    withSignal(signal),
  );
  return z.array(projectQuoteRequestDtoSchema).parse(data);
}
