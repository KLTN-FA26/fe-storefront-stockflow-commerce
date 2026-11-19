/**
 * Mock routes for the customer's chat: /chat/me/conversations… (plan Phụ lục B §B.2 C1–C14), with
 * the WF-02 cards (QUOTE_REQUEST, QUOTE, CONTRACT, PAYMENT_INFO / PAYMENT_REMINDER, CSAT_SURVEY,
 * §B.7). The rules live in `mock-fixtures/chat.ts`; this file wires them to the quote and contract
 * mocks and listens to `mock-fixtures/wf02.ts` for the quote requests and quote changes made
 * elsewhere (the BE posts or refreshes those cards after commit, 16 §4.2–§4.4).
 */

import type { AxiosRequestConfig } from "axios";

import { registerMockRoute } from "./mock-adapter";
import { mockContractCardPayload } from "./mock-contracts";
import { MOCK_CUSTOMER_ID } from "./mock-customer-addresses";
import { createMockChatStore, type MockChatStore } from "./mock-fixtures/chat";
import { MOCK_FOREIGN_CONTEXT_ID, localContractPayload } from "./mock-fixtures/chat-seed";
import { foreignMockOrderId, seededMockOrderId, type MockResult } from "./mock-fixtures/orders";
import { MOCK_CONTRACT_ORDER_IDS, MOCK_QUOTE_IDS, onMockChatEvent } from "./mock-fixtures/wf02";
import { mockQuoteCardAction, mockQuoteCardPayload } from "./mock-quotes";

const respond = (result: MockResult) => ({ status: result.status, data: result.data, headers: {} });

const pathParams = (config: AxiosRequestConfig): Record<string, string> =>
  (config as AxiosRequestConfig & { _mockParams?: Record<string, string> })._mockParams ?? {};

function queryParams(config: AxiosRequestConfig): Record<string, unknown> {
  const raw: unknown = config.params;
  if (raw instanceof URLSearchParams) return Object.fromEntries(raw);
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
}

function bodyOf(config: AxiosRequestConfig): Record<string, unknown> {
  let raw: unknown = config.data;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      raw = undefined;
    }
  }
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
}

function formOf(config: AxiosRequestConfig) {
  const form = config.data instanceof FormData ? config.data : null;
  const file = form?.get("file");
  return {
    file: file instanceof Blob ? file : null,
    ...(file instanceof File ? { fileName: file.name } : {}),
    caption: form?.get("caption") ?? undefined,
    clientMessageId: form?.get("clientMessageId") ?? undefined,
  };
}

/** The contract payloads the contract mock knows, else the chat's own stand-in. */
function contractPayloads() {
  return Object.values(MOCK_CONTRACT_ORDER_IDS)
    .map((orderId) => mockContractCardPayload(orderId))
    .concat([localContractPayload(new Date())])
    .filter((payload): payload is Record<string, unknown> => payload !== null);
}

const SEEDED_ORDERS = new Set(Array.from({ length: 24 }, (_, n) => seededMockOrderId(n)));

/**
 * 16 BR-02 in the mock: quotes, orders and contracts are checked against the demo customer's seeds.
 * Designs, projects, products and SKUs are the design / catalog mocks' (whose stores this mock does
 * not read): any id is taken as the customer's own except the seeded foreign one.
 */
function owns(kind: string, id: string): boolean {
  if (!id.trim() || id === MOCK_FOREIGN_CONTEXT_ID || id === foreignMockOrderId()) return false;
  switch (kind) {
    case "QUOTE":
      return (
        (Object.values(MOCK_QUOTE_IDS) as string[]).includes(id) ||
        mockQuoteCardPayload(id) !== null
      );
    case "ORDER":
      return (
        SEEDED_ORDERS.has(id) || (Object.values(MOCK_CONTRACT_ORDER_IDS) as string[]).includes(id)
      );
    case "CONTRACT":
      return contractPayloads().some((payload) => payload.contractId === id);
    case "DESIGN":
    case "DESIGN_PROJECT":
    case "PRODUCT":
    case "CUSTOMER_SKU":
      return true;
    default:
      return false;
  }
}

const text = (value: unknown) => (typeof value === "string" && value ? value : undefined);

function describe(kind: string, id: string): { label?: string; status?: string } | null {
  if (kind === "QUOTE") {
    const quote = mockQuoteCardPayload(id);
    return quote ? { label: text(quote.number) ?? "", status: text(quote.status) ?? "" } : null;
  }
  const contract = contractPayloads().find((payload) =>
    kind === "ORDER" ? payload.orderId === id : payload.contractId === id,
  );
  if (!contract) return null;
  return kind === "ORDER"
    ? { label: text(contract.orderNumber) ?? "" }
    : { label: text(contract.number) ?? "", status: text(contract.status) ?? "" };
}

let unsubscribe: (() => void) | undefined;

export function registerChatMockRoutes(
  store: MockChatStore = createMockChatStore({
    customerId: MOCK_CUSTOMER_ID,
    owns,
    describe,
    quotePayload: mockQuoteCardPayload,
    contractPayload: mockContractCardPayload,
    quoteAction: (quoteId, action, body) => mockQuoteCardAction(quoteId, action, body),
    autoReplyMs: 4_000,
  }),
): void {
  unsubscribe?.();
  unsubscribe = onMockChatEvent((event) => store.onEvent(event));

  const base = "/chat/me/conversations";
  const id = (config: AxiosRequestConfig) => pathParams(config).id ?? "";
  const messageId = (config: AxiosRequestConfig) => pathParams(config).messageId ?? "";

  // Before `/:id`: the route table matches in registration order.
  registerMockRoute("GET", `${base}/unread-count`, () => respond(store.unread()));
  registerMockRoute("POST", base, (config) => respond(store.open(bodyOf(config))));
  registerMockRoute("GET", base, (config) => respond(store.list(queryParams(config))));
  registerMockRoute("GET", `${base}/:id`, (config) => respond(store.get(id(config))));
  registerMockRoute("GET", `${base}/:id/messages`, (config) =>
    respond(store.messages(id(config), queryParams(config))),
  );
  registerMockRoute("POST", `${base}/:id/messages`, (config) =>
    respond(store.send(id(config), bodyOf(config))),
  );
  registerMockRoute("PATCH", `${base}/:id/messages/:messageId`, (config) =>
    respond(store.edit(id(config), messageId(config), bodyOf(config))),
  );
  registerMockRoute("DELETE", `${base}/:id/messages/:messageId`, (config) =>
    respond(store.remove(id(config), messageId(config))),
  );
  registerMockRoute("POST", `${base}/:id/attachments`, (config) =>
    respond(store.sendFile(id(config), formOf(config))),
  );
  registerMockRoute("GET", `${base}/:id/attachments/:attachmentId/link`, (config) =>
    respond(store.link(id(config), pathParams(config).attachmentId ?? "")),
  );
  registerMockRoute("POST", `${base}/:id/read`, (config) =>
    respond(store.read(id(config), bodyOf(config))),
  );
  registerMockRoute("POST", `${base}/:id/reopen`, (config) => respond(store.reopen(id(config))));
  registerMockRoute("POST", `${base}/:id/cards/:messageId/actions`, (config) =>
    respond(store.act(id(config), messageId(config), bodyOf(config))),
  );
  registerMockRoute("POST", `${base}/:id/csat`, (config) =>
    respond(store.rate(id(config), bodyOf(config))),
  );
}
