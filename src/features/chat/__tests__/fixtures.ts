/**
 * BE-shaped chat JSON for the tests (BE ChatConversationView / ChatMessageView, plan Phụ lục B
 * §B.1, §B.7): null fields are omitted, as the BE's `non_null` writes them.
 */

export const CONVERSATION_ID = "11111111-1111-4111-8111-111111111111";
export const QUOTE_ID = "22222222-2222-4222-8222-222222222222";
export const LINE_ID = "33333333-3333-4333-8333-333333333333";

export function conversationJson(overrides: Record<string, unknown> = {}) {
  return {
    id: CONVERSATION_ID,
    customerId: "c0ffee00-0000-4000-8000-000000000010",
    customerName: "Khách hàng demo",
    subject: "Báo giá ly logo xanh",
    status: "ACTIVE",
    assignedAgentId: "a0000000-0000-4000-8000-000000000001",
    assignedAgentName: "Nguyễn Minh (Sale)",
    agentOnline: true,
    firstResponseOverdue: false,
    resolutionOverdue: false,
    createdAt: "2026-11-16T02:00:00Z",
    lastSeq: 3,
    unread: 0,
    contexts: [],
    withinBusinessHours: true,
    canRate: false,
    ...overrides,
  };
}

let seq = 0;
export function messageJson(overrides: Record<string, unknown> = {}) {
  seq += 1;
  return {
    id: `m${seq}`,
    conversationId: CONVERSATION_ID,
    seq,
    kind: "TEXT",
    visibility: "CUSTOMER",
    senderType: "AGENT",
    senderId: "a0000000-0000-4000-8000-000000000001",
    senderName: "Nguyễn Minh (Sale)",
    body: `Tin nhắn ${seq}`,
    attachments: [],
    mentions: [],
    sentAt: "2026-11-18T03:00:00Z",
    deleted: false,
    ...overrides,
  };
}

export function quotePayload(overrides: Record<string, unknown> = {}) {
  return {
    id: QUOTE_ID,
    quoteId: QUOTE_ID,
    number: "BG-20261118-0001",
    status: "SENT",
    revision: 1,
    validUntil: "2099-12-31T00:00:00Z",
    requestedDeliveryDate: "2026-12-09",
    lines: [
      {
        id: LINE_ID,
        lineNo: 1,
        sku: "LY-GIAY-DEMO-12OZ-XANH",
        cartons: 60,
        unitsPerCarton: 1000,
        units: 60000,
        unitPrice: 1150,
        lineTotal: 69000000,
      },
    ],
    proposedTotal: 76140000,
    sentAt: "2026-11-17T03:00:00Z",
    version: 3,
    currency: "VND",
    ...overrides,
  };
}

export function cardMessageJson(
  kind: string,
  payload: Record<string, unknown>,
  card: Record<string, unknown> = {},
  overrides: Record<string, unknown> = {},
) {
  return messageJson({
    kind: "CARD",
    senderType: "SYSTEM",
    senderName: undefined,
    senderId: undefined,
    body: `Thẻ ${kind}`,
    card: { kind, state: "OPEN", payload, customerActions: [], staffActions: [], ...card },
    ...overrides,
  });
}

export function designRequestPayload(overrides: Record<string, unknown> = {}) {
  return {
    scope: "DESIGN",
    requestId: "44444444-4444-4444-8444-444444444444",
    designId: "55555555-5555-4555-8555-555555555555",
    designName: "Ly giấy 12oz logo xanh",
    designStatus: "APPROVED",
    sku: "CUP-PAPER-12OZ-WHT",
    customerSku: "LY-GIAY-DEMO-12OZ-XANH",
    returnReason: null,
    cartons: 60,
    desiredDeliveryDate: "2026-12-09",
    requestStatus: "OPEN",
    requestedAt: "2026-11-16T02:00:00Z",
    ...overrides,
  };
}
