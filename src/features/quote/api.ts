import { api } from "@/lib/api/client";

import {
  quoteAcceptanceInputSchema,
  quoteChangeRequestInputSchema,
  quoteDtoSchema,
  quotePageDtoSchema,
} from "./schemas";
import type {
  MyQuotesParams,
  Quote,
  QuoteAcceptanceInput,
  QuoteChangeRequestInput,
  QuotePage,
} from "./types";

// BE QuoteController: /api/v1/quotes — the /v1 prefix lives in API_URL. A customer sees only their
// own quotes, and only once sent (QuoteService.requireVisible: anything else answers 404).

const path = (quoteId: string) => `/quotes/${encodeURIComponent(quoteId)}`;

/** GET /quotes?status=&page=&size= — FE pages are 1-based, the BE PageResponse is 0-based. */
export async function getMyQuotes(
  params: MyQuotesParams,
  signal?: AbortSignal,
): Promise<QuotePage> {
  const { data } = await api.get<unknown>("/quotes", {
    params: {
      page: Math.max(params.page, 1) - 1,
      size: params.size,
      ...(params.status ? { status: params.status } : {}),
    },
    ...(signal ? { signal } : {}),
  });
  const page = quotePageDtoSchema.parse(data);
  return { ...page, page: page.page + 1 };
}

/** GET /quotes/{id}. */
export async function getQuote(quoteId: string, signal?: AbortSignal): Promise<Quote> {
  const { data } = await api.get<unknown>(path(quoteId), signal ? { signal } : {});
  return quoteDtoSchema.parse(data);
}

/**
 * GET /quotes/{id}/document — the quote drawn as a PDF (the offer as sent, or as accepted). The body
 * is the file itself, not an envelope. A refusal is the JSON envelope (404 NOT_FOUND, 503
 * SELLER_PROFILE_UNAVAILABLE), so the request accepts JSON too and the client reads the Blob body
 * into the ApiError (lib/api/blob-error).
 */
export async function getQuoteDocument(quoteId: string): Promise<Blob> {
  const { data } = await api.get<Blob>(`${path(quoteId)}/document`, {
    responseType: "blob",
    headers: { Accept: "application/pdf, application/json" },
  });
  return data;
}

/**
 * POST /quotes/{id}/acceptance `{ version, lines: [{ lineId, cartons }] }` (14 §4.1 step 4). The BE
 * picks each line's tier from the accepted cartons of its SKU and answers the accepted quote.
 */
export async function acceptQuote(input: QuoteAcceptanceInput): Promise<Quote> {
  const { quoteId, version, lines } = quoteAcceptanceInputSchema.parse(input);
  const { data } = await api.post<unknown>(`${path(quoteId)}/acceptance`, { version, lines });
  return quoteDtoSchema.parse(data);
}

/** POST /quotes/{id}/change-request `{ version, feedback }` — SENT → CHANGES_REQUESTED. */
export async function requestQuoteChanges(input: QuoteChangeRequestInput): Promise<Quote> {
  const { quoteId, version, feedback } = quoteChangeRequestInputSchema.parse(input);
  const { data } = await api.post<unknown>(`${path(quoteId)}/change-request`, {
    version,
    feedback,
  });
  return quoteDtoSchema.parse(data);
}
