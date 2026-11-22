import { z } from "zod";

import { api } from "@/lib/api/client";
import { beId } from "@/lib/validation/primitives";

// What the account home's "Việc cần làm" counts (SF-UX-39): the customer's quotes waiting for an
// answer and the orders whose contract waits to be signed. Only the count and the first few ids are
// read (a link opens the one document when there is only one), so the rows are parsed loosely here
// instead of through the quote and order features (a feature does not import another).

const firstRows = 5;

const todoPage = <T extends z.ZodType>(row: T) =>
  z.object({ items: z.array(row), totalElements: z.number().int().nonnegative() });

const quoteRow = z.object({ id: beId(), quoteNumber: z.string().min(1) });
const orderRow = z.object({ orderId: beId(), orderNumber: z.string().min(1) });

export type TodoDocument = { id: string; number: string };
export type TodoCount = { total: number; first: TodoDocument[] };

const withSignal = (signal?: AbortSignal) => (signal ? { signal } : {});

/**
 * GET /quotes?status=SENT: sent and still valid, so waiting for the customer (the BE reports a
 * SENT quote past its validity as EXPIRED, kltn-docs 14 §5.1).
 */
export async function countQuotesToAnswer(signal?: AbortSignal): Promise<TodoCount> {
  const { data } = await api.get<unknown>("/quotes", {
    params: { status: "SENT", page: 0, size: firstRows },
    ...withSignal(signal),
  });
  const page = todoPage(quoteRow).parse(data);
  return {
    total: page.totalElements,
    first: page.items.map((row) => ({ id: row.id, number: row.quoteNumber })),
  };
}

/** GET /orders/me?status=PENDING_CONTRACT: the contract was sent and waits for the signed copy. */
export async function countContractsToSign(signal?: AbortSignal): Promise<TodoCount> {
  const { data } = await api.get<unknown>("/orders/me", {
    params: { status: "PENDING_CONTRACT", page: 0, size: firstRows },
    ...withSignal(signal),
  });
  const page = todoPage(orderRow).parse(data);
  return {
    total: page.totalElements,
    first: page.items.map((row) => ({ id: row.orderId, number: row.orderNumber })),
  };
}
