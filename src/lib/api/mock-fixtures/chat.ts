/**
 * The customer's chat as the BE runs it (plan Phụ lục B §B.2 C1–C14, kltn-docs 16), in memory.
 *
 * Rules kept: a context must be the customer's own (else 404 CHAT_CONTEXT_NOT_FOUND, BR-02); an open
 * conversation about the same document is reused; messages get increasing `seq` and page by
 * `before` / `since`; internal notes are stored but never answered to the customer (BR-07); an
 * ended conversation refuses messages past its reopen window (409 CHAT_CONVERSATION_ENDED) and C9
 * continues it in a new one; card buttons come from `cardActionsOf` (BE `CardActions.of`).
 *
 * Mock layer only: returns `MockResult` envelopes like the other fixture books.
 */

import {
  MOCK_AGENT,
  MOCK_CHAT_DESIGN_ID,
  MOCK_CHAT_IDS,
  MOCK_FOREIGN_CONTEXT_ID,
  MOCK_OTHER_CUSTOMER_ID,
  localContractPayload,
  localDesignRequestPayload,
  localQuoteAction,
  localQuotePayload,
  localTransferPayload,
} from "./chat-seed";
import { MOCK_CONTRACT_ORDER_IDS, MOCK_QUOTE_IDS, type MockChatEvent } from "./wf02";

import type { MockResult } from "./orders";

type Payload = Record<string, unknown>;

interface StoredCard {
  kind: string;
  state: string;
  payload: Payload;
  updatedAt?: string;
}

interface StoredAttachment {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  url: string;
}

interface StoredMessage {
  id: string;
  seq: number;
  kind: "TEXT" | "ATTACHMENT" | "CARD" | "SYSTEM" | "INTERNAL_NOTE";
  visibility: "CUSTOMER" | "STAFF";
  senderType: "CUSTOMER" | "AGENT" | "SYSTEM";
  senderId?: string;
  senderName?: string;
  body?: string;
  clientMessageId?: string;
  card?: StoredCard;
  attachments: StoredAttachment[];
  sentAt: string;
  editedAt?: string;
  deleted: boolean;
}

interface StoredContext {
  id: string;
  kind: string;
  refId: string;
  primary: boolean;
  label?: string;
  status?: string;
  attachedAt: string;
}

interface StoredConversation {
  id: string;
  customerId: string;
  subject?: string;
  status: string;
  agentOnline: boolean;
  assigned: boolean;
  reopenUntil?: string;
  continuedFromId?: string;
  createdAt: string;
  resolvedAt?: string;
  contexts: StoredContext[];
  messages: StoredMessage[];
  customerReadSeq: number;
  csatScore?: number;
  csatSubmittedAt?: string;
  /** When Sales' canned answer to the customer's last message shows up (demo only). */
  replyAt?: number;
}

export interface MockChatDeps {
  customerId: string;
  now?: () => Date;
  newId?: () => string;
  /** B.7.3 payload of a quote as the quote mock has it; null when it does not know it. */
  quotePayload?: (quoteId: string) => Payload | null;
  /** B.7.4 payload of an order's contract; null when there is none sent. */
  contractPayload?: (orderId: string) => Payload | null;
  /** The quote mock's own ACCEPT / REQUEST_CHANGES (its refusals pass through C10 unchanged). */
  quoteAction?: (
    quoteId: string,
    action: "ACCEPT" | "REQUEST_CHANGES",
    body: { version: number; cartons?: Record<string, number>; note?: string },
  ) => MockResult;
  /** 16 BR-02: whether the document is the signed-in customer's (and visible to them). */
  owns: (kind: string, id: string) => boolean;
  /** Label and status of a document for the detail's contexts. */
  describe?: (kind: string, id: string) => { label?: string; status?: string } | null;
  /** Sales answer a customer message this long after it; null never (tests). */
  autoReplyMs?: number | null;
  /** Seed the demo conversations on first use (default true). */
  seed?: boolean;
}

export const CHAT_CONTEXT_KINDS = [
  "PRODUCT",
  "CUSTOMER_SKU",
  "DESIGN",
  "DESIGN_PROJECT",
  "QUOTE",
  "ORDER",
  "CONTRACT",
  "PRODUCTION_ORDER",
  "EINVOICE",
];
const CHAT_FILE_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const CHAT_FILE_MAX = 20 * 1024 * 1024;
const TEXT_MAX = 4000;
const EDIT_WINDOW_MS = 5 * 60_000;
const ENDED = new Set(["RESOLVED", "AUTO_CLOSED", "CLOSED"]);

const ok = (data?: unknown, status = 200): MockResult => ({
  status,
  data: {
    success: true,
    ...(data === undefined ? {} : { data }),
    timestamp: new Date().toISOString(),
  },
});
const fail = (
  status: number,
  errorCode: string,
  message: string,
  details?: Payload,
): MockResult => ({
  status,
  data: {
    success: false,
    errorCode,
    message,
    ...(details ? { details } : {}),
    correlationId: `mock-chat-${errorCode.toLowerCase()}`,
    timestamp: new Date().toISOString(),
  },
});
const notFound = () => fail(404, "CHAT_CONVERSATION_NOT_FOUND", "Không tìm thấy cuộc trò chuyện.");

/** BE `CardActions.of`: what each side may do on a card now; nothing unless it is OPEN. */
export function cardActionsOf(card: StoredCard): { customer: string[]; staff: string[] } {
  const none = { customer: [], staff: [] };
  if (card.state !== "OPEN") return none;
  const payload = card.payload;
  switch (card.kind) {
    case "QUOTE_REQUEST":
      return quotable(payload) ? { customer: [], staff: ["CREATE_QUOTE"] } : none;
    case "QUOTE":
      return payload.status === "SENT"
        ? { customer: ["ACCEPT", "REQUEST_CHANGES"], staff: [] }
        : none;
    case "SAMPLE_APPROVAL":
      return payload.status === "WAITING"
        ? { customer: ["APPROVE", "REQUEST_REPRINT"], staff: [] }
        : none;
    case "CSAT_SURVEY":
      return { customer: ["RATE"], staff: [] };
    default:
      return none;
  }
}

const approved = (design: Payload) =>
  design.designStatus === "APPROVED" &&
  typeof design.customerSku === "string" &&
  design.customerSku.trim() !== "";

function quotable(payload: Payload): boolean {
  if (payload.quoteId !== undefined && payload.quoteId !== null) return false;
  if (payload.scope === "PROJECT") {
    const lines = Array.isArray(payload.lines) ? (payload.lines as Payload[]) : [];
    return payload.status === "OPEN" && lines.length > 0 && lines.every(approved);
  }
  return payload.requestStatus === "OPEN" && approved(payload);
}

/** 16 BR-08: card numbers are masked before storage. */
const mask = (text: string) =>
  text.replace(
    /\b(?:\d[ -]?){12,18}\d\b/g,
    (match) => `•••• ${match.replace(/\D/g, "").slice(-4)}`,
  );

const num = (value: unknown): number | undefined => {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const isText = (value: unknown): value is string => typeof value === "string";
const uuidOf = (prefix: string, n: number) =>
  `${prefix}-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;

/** Vietnam business hours (UTC+7): Monday to Saturday, 08:00–17:30. */
function withinBusinessHours(at: Date): boolean {
  const local = new Date(at.getTime() + 7 * 3_600_000);
  const minutes = local.getUTCHours() * 60 + local.getUTCMinutes();
  return local.getUTCDay() !== 0 && minutes >= 8 * 60 && minutes < 17 * 60 + 30;
}
/** The next 08:00 Vietnam time of a working day after `at`. */
function nextOpening(at: Date): Date {
  const local = new Date(at.getTime() + 7 * 3_600_000);
  local.setUTCHours(8, 0, 0, 0);
  if (local.getTime() - 7 * 3_600_000 <= at.getTime()) local.setUTCDate(local.getUTCDate() + 1);
  if (local.getUTCDay() === 0) local.setUTCDate(local.getUTCDate() + 1);
  return new Date(local.getTime() - 7 * 3_600_000);
}

export type MockChatStore = ReturnType<typeof createMockChatStore>;

export function createMockChatStore(deps: MockChatDeps) {
  const now = deps.now ?? (() => new Date());
  let counter = 0;
  const newId = deps.newId ?? (() => uuidOf("c4a7a000", ++counter));
  const conversations: StoredConversation[] = [];
  let seeded = deps.seed === false;

  /* ── Views ─────────────────────────────────────────────────────────── */

  const visible = (c: StoredConversation) => c.messages.filter((m) => m.visibility !== "STAFF");
  const lastSeqOf = (c: StoredConversation) => visible(c).at(-1)?.seq ?? 0;
  const unreadOf = (c: StoredConversation) =>
    visible(c).filter((m) => m.seq > c.customerReadSeq && m.senderType !== "CUSTOMER").length;

  function messageView(m: StoredMessage, conversationId: string) {
    const actions = m.card ? cardActionsOf(m.card) : null;
    return {
      id: m.id,
      conversationId,
      seq: m.seq,
      kind: m.kind,
      visibility: m.visibility,
      senderType: m.senderType,
      ...(m.senderId ? { senderId: m.senderId } : {}),
      ...(m.senderName ? { senderName: m.senderName } : {}),
      ...(!m.deleted && m.body !== undefined ? { body: m.body } : {}),
      ...(m.clientMessageId ? { clientMessageId: m.clientMessageId } : {}),
      ...(m.card && actions
        ? {
            card: {
              kind: m.card.kind,
              state: m.card.state,
              ...(m.deleted ? {} : { payload: m.card.payload }),
              ...(m.card.updatedAt ? { updatedAt: m.card.updatedAt } : {}),
              customerActions: actions.customer,
              staffActions: actions.staff,
            },
          }
        : {}),
      attachments: m.deleted
        ? []
        : m.attachments.map(({ id, fileName, contentType, sizeBytes }) => ({
            id,
            fileName,
            contentType,
            sizeBytes,
          })),
      mentions: [],
      sentAt: m.sentAt,
      ...(m.editedAt ? { editedAt: m.editedAt } : {}),
      deleted: m.deleted,
    };
  }

  /** When Sales are expected to answer: only while the customer's last message waits for them. */
  function expectedResponseAt(c: StoredConversation): string | undefined {
    if (ENDED.has(c.status)) return undefined;
    const shown = visible(c);
    const lastCustomer = [...shown].reverse().find((m) => m.senderType === "CUSTOMER");
    if (!lastCustomer || shown.some((m) => m.seq > lastCustomer.seq && m.senderType === "AGENT")) {
      return undefined;
    }
    const sent = new Date(lastCustomer.sentAt);
    return withinBusinessHours(sent)
      ? new Date(sent.getTime() + 15 * 60_000).toISOString()
      : nextOpening(sent).toISOString();
  }

  function conversationView(c: StoredConversation, detail: boolean) {
    const last = visible(c).at(-1);
    return {
      id: c.id,
      customerId: c.customerId,
      customerName: "Khách hàng demo",
      ...(c.subject ? { subject: c.subject } : {}),
      status: c.status,
      ...(c.assigned ? { assignedAgentId: MOCK_AGENT.id, assignedAgentName: MOCK_AGENT.name } : {}),
      agentOnline: c.assigned && c.agentOnline,
      firstResponseOverdue: false,
      resolutionOverdue: false,
      ...(c.reopenUntil ? { reopenUntil: c.reopenUntil } : {}),
      ...(c.continuedFromId ? { continuedFromId: c.continuedFromId } : {}),
      createdAt: c.createdAt,
      ...(last ? { lastMessageAt: last.sentAt, lastMessage: messageView(last, c.id) } : {}),
      lastSeq: lastSeqOf(c),
      unread: unreadOf(c),
      contexts: c.contexts.map((context) => {
        const described = detail ? (deps.describe?.(context.kind, context.refId) ?? null) : null;
        const label = described?.label ?? context.label;
        const status = described?.status ?? context.status;
        return {
          id: context.id,
          kind: context.kind,
          refId: context.refId,
          primary: context.primary,
          ...(detail && label ? { label } : {}),
          ...(detail && status ? { status } : {}),
          attachedAt: context.attachedAt,
        };
      }),
      ...(detail
        ? {
            readMarkers: [
              {
                conversationId: c.id,
                userId: deps.customerId,
                side: "CUSTOMER",
                seq: c.customerReadSeq,
                at: now().toISOString(),
              },
            ],
          }
        : {}),
      withinBusinessHours: withinBusinessHours(now()),
      ...(expectedResponseAt(c) ? { expectedResponseAt: expectedResponseAt(c) } : {}),
      ...(c.resolvedAt ? { resolvedAt: c.resolvedAt } : {}),
      canRate: c.status === "RESOLVED" && c.csatScore === undefined,
      ...(c.csatScore !== undefined ? { csatScore: c.csatScore } : {}),
      ...(c.csatSubmittedAt ? { csatSubmittedAt: c.csatSubmittedAt } : {}),
    };
  }

  /* ── Writing ───────────────────────────────────────────────────────── */

  function post(
    c: StoredConversation,
    message: Omit<StoredMessage, "id" | "seq" | "sentAt" | "attachments" | "deleted"> &
      Partial<Pick<StoredMessage, "sentAt" | "attachments">>,
  ) {
    const stored: StoredMessage = {
      id: newId(),
      seq: (c.messages.at(-1)?.seq ?? 0) + 1,
      sentAt: now().toISOString(),
      attachments: [],
      deleted: false,
      ...message,
    };
    c.messages.push(stored);
    return stored;
  }

  function attach(
    c: StoredConversation,
    kind: string,
    refId: string,
    label?: string,
    status?: string,
  ) {
    const found = c.contexts.find((context) => context.kind === kind && context.refId === refId);
    if (found) return found;
    const context: StoredContext = {
      id: newId(),
      kind,
      refId,
      primary: c.contexts.length === 0,
      ...(label ? { label } : {}),
      ...(status ? { status } : {}),
      attachedAt: now().toISOString(),
    };
    c.contexts.push(context);
    return context;
  }

  function newConversation(subject?: string, continuedFromId?: string): StoredConversation {
    const c: StoredConversation = {
      id: newId(),
      customerId: deps.customerId,
      ...(subject ? { subject } : {}),
      status: "ASSIGNED",
      agentOnline: true,
      assigned: true,
      ...(continuedFromId ? { continuedFromId } : {}),
      createdAt: now().toISOString(),
      contexts: [],
      messages: [],
      customerReadSeq: 0,
    };
    conversations.push(c);
    return c;
  }

  /** Sales' canned answer, shown once its time has come (so polling has something to catch). */
  function materializeReply(c: StoredConversation) {
    if (c.replyAt === undefined || now().getTime() < c.replyAt) return;
    delete c.replyAt;
    post(c, {
      kind: "TEXT",
      visibility: "CUSTOMER",
      senderType: "AGENT",
      senderId: MOCK_AGENT.id,
      senderName: MOCK_AGENT.name,
      body: "Dạ em đã nhận được tin nhắn, em kiểm tra và phản hồi anh/chị ngay ạ.",
    });
    if (c.status !== "WAITING_ON_INTERNAL") c.status = "ACTIVE";
  }

  const isMine = (c: StoredConversation) => c.customerId === deps.customerId;
  const isOpen = (c: StoredConversation) => !ENDED.has(c.status);
  const pastWindow = (c: StoredConversation) =>
    c.status === "CLOSED" ||
    (ENDED.has(c.status) && (!c.reopenUntil || new Date(c.reopenUntil) <= now()));

  function mine(id: string): StoredConversation | null {
    ensureSeeded();
    const c = conversations.find((candidate) => candidate.id === id && isMine(candidate));
    if (c) materializeReply(c);
    return c ?? null;
  }

  const byActivity = (a: StoredConversation, b: StoredConversation) =>
    (b.messages.at(-1)?.sentAt ?? b.createdAt).localeCompare(
      a.messages.at(-1)?.sentAt ?? a.createdAt,
    );

  function openAbout(kind: string, refId: string): StoredConversation | undefined {
    return conversations
      .filter((c) => isMine(c) && isOpen(c))
      .filter((c) => c.contexts.some((context) => context.kind === kind && context.refId === refId))
      .sort(byActivity)[0];
  }
  const newestOpen = () => conversations.filter((c) => isMine(c) && isOpen(c)).sort(byActivity)[0];

  /** B.6 card routing: about the document, else the newest open one, else a new one. */
  function routeCard(kind: string, refId: string, label?: string) {
    const c = openAbout(kind, refId) ?? newestOpen() ?? newConversation();
    attach(c, kind, refId, label);
    return c;
  }

  function validText(raw: unknown): string | MockResult {
    const text = isText(raw) ? raw.trim() : "";
    if (!text) return fail(400, "VALIDATION_FAILED", "Tin nhắn cần có nội dung.");
    if (text.length > TEXT_MAX)
      return fail(400, "VALIDATION_FAILED", "Tin nhắn tối đa 4000 ký tự.");
    return mask(text);
  }

  /** A customer message moves the conversation (C5): back to ACTIVE, or REOPENED in its window. */
  function customerWrote(c: StoredConversation) {
    if (c.status === "WAITING_ON_CUSTOMER") c.status = "ACTIVE";
    else if (c.status === "RESOLVED" || c.status === "AUTO_CLOSED") c.status = "REOPENED";
    c.customerReadSeq = lastSeqOf(c);
    if (deps.autoReplyMs !== null && deps.autoReplyMs !== undefined && c.assigned) {
      c.replyAt = now().getTime() + deps.autoReplyMs;
    }
  }

  function sendText(c: StoredConversation, rawText: unknown, rawClientId: unknown): MockResult {
    if (pastWindow(c)) {
      return fail(
        409,
        "CHAT_CONVERSATION_ENDED",
        "Cuộc trò chuyện đã kết thúc. Hãy mở lại để tiếp tục.",
      );
    }
    const text = validText(rawText);
    if (!isText(text)) return text;
    const clientMessageId = isText(rawClientId) && rawClientId ? rawClientId : undefined;
    if (clientMessageId) {
      const same = c.messages.find((m) => m.clientMessageId === clientMessageId);
      if (same) {
        return same.body === text
          ? ok(messageView(same, c.id), 201)
          : fail(
              409,
              "CHAT_CLIENT_MESSAGE_ID_REUSED",
              "Mã tin nhắn đã được dùng cho nội dung khác.",
            );
      }
    }
    const message = post(c, {
      kind: "TEXT",
      visibility: "CUSTOMER",
      senderType: "CUSTOMER",
      senderId: deps.customerId,
      senderName: "Bạn",
      body: text,
      ...(clientMessageId ? { clientMessageId } : {}),
    });
    customerWrote(c);
    return ok(messageView(message, c.id), 201);
  }

  /* ── Seed (lazy: the quote and contract mocks fill their payloads in parallel) ── */

  function ensureSeeded() {
    if (seeded) return;
    seeded = true;
    const at = now();
    const ago = (ms: number) => new Date(at.getTime() - ms).toISOString();
    const HOUR = 3_600_000;
    const DAY = 24 * HOUR;
    const quote = deps.quotePayload?.(MOCK_QUOTE_IDS.sent) ?? localQuotePayload(at);
    const contract =
      deps.contractPayload?.(MOCK_CONTRACT_ORDER_IDS.sent) ?? localContractPayload(at);
    const signed = deps.contractPayload?.(MOCK_CONTRACT_ORDER_IDS.signed) ?? null;
    const request = localDesignRequestPayload(at);
    const agent = { senderId: MOCK_AGENT.id, senderName: MOCK_AGENT.name };

    const thread: StoredConversation = {
      id: MOCK_CHAT_IDS.quoteThread,
      customerId: deps.customerId,
      subject: "Báo giá ly logo xanh",
      status: "WAITING_ON_CUSTOMER",
      agentOnline: true,
      assigned: true,
      createdAt: ago(2 * DAY),
      contexts: [],
      messages: [],
      customerReadSeq: 0,
    };
    conversations.push(thread);
    attach(thread, "DESIGN", MOCK_CHAT_DESIGN_ID, "Ly giấy 12oz logo xanh", "APPROVED");
    attach(
      thread,
      "QUOTE",
      MOCK_QUOTE_IDS.sent,
      String(quote.number ?? ""),
      String(quote.status ?? ""),
    );
    attach(
      thread,
      "ORDER",
      String(contract.orderId),
      isText(contract.orderNumber) ? contract.orderNumber : undefined,
    );
    const sys = { visibility: "CUSTOMER" as const, senderType: "SYSTEM" as const };
    post(thread, {
      ...sys,
      kind: "CARD",
      body: "Yêu cầu báo giá: Ly giấy 12oz logo xanh",
      card: { kind: "QUOTE_REQUEST", state: "ACTED", payload: request, updatedAt: ago(DAY) },
      sentAt: ago(2 * DAY),
    });
    post(thread, {
      kind: "TEXT",
      visibility: "CUSTOMER",
      senderType: "AGENT",
      ...agent,
      body: "Chào anh/chị, em là Sale phụ trách. Bản thiết kế ly logo xanh đã được duyệt, em lập báo giá ngay ạ.",
      sentAt: ago(2 * DAY - 10 * 60_000),
    });
    post(thread, {
      kind: "INTERNAL_NOTE",
      visibility: "STAFF",
      senderType: "AGENT",
      ...agent,
      body: "Ghi chú nội bộ: khách quen, ưu tiên giao trước 15/12. Không báo khách.",
      sentAt: ago(2 * DAY - 12 * 60_000),
    });
    post(thread, {
      kind: "CARD",
      visibility: "CUSTOMER",
      senderType: "AGENT",
      ...agent,
      body: `Báo giá ${String(quote.number ?? "")}`,
      card: { kind: "QUOTE", state: "OPEN", payload: quote },
      sentAt: ago(DAY),
    });
    post(thread, {
      kind: "TEXT",
      visibility: "CUSTOMER",
      senderType: "CUSTOMER",
      senderId: deps.customerId,
      senderName: "Bạn",
      body: "Mình đã xem báo giá. Phí khuôn có tính lại cho lần đặt sau không ạ?",
      sentAt: ago(DAY - HOUR),
    });
    post(thread, {
      kind: "TEXT",
      visibility: "CUSTOMER",
      senderType: "AGENT",
      ...agent,
      body: "Dạ phí khuôn chỉ tính một lần cho bản thiết kế này ạ. Anh/chị bấm Chấp nhận ngay trên thẻ báo giá là được.",
      sentAt: ago(DAY - 2 * HOUR),
    });
    thread.customerReadSeq = thread.messages.at(-1)?.seq ?? 0;
    post(thread, {
      ...sys,
      kind: "CARD",
      body: `Hợp đồng ${String(contract.number ?? "")}`,
      card: { kind: "CONTRACT", state: "OPEN", payload: contract },
      sentAt: ago(3 * HOUR),
    });
    const transfer = localTransferPayload(at, signed);
    post(thread, {
      ...sys,
      kind: "CARD",
      body: `Thông tin chuyển khoản ${String(transfer.transferContent)}`,
      card: { kind: "PAYMENT_INFO", state: "OPEN", payload: transfer },
      sentAt: ago(2 * HOUR),
    });
    post(thread, {
      kind: "TEXT",
      visibility: "CUSTOMER",
      senderType: "AGENT",
      ...agent,
      body: "Anh/chị chuyển khoản theo thông tin trên giúp em nhé. Ký hợp đồng xong anh/chị gửi bản scan vào đây ạ.",
      sentAt: ago(2 * HOUR - 60_000),
    });

    const resolved: StoredConversation = {
      id: MOCK_CHAT_IDS.resolvedThread,
      customerId: deps.customerId,
      subject: "Hỏi về ly giấy 2 lớp in 2 màu",
      status: "RESOLVED",
      agentOnline: true,
      assigned: true,
      reopenUntil: new Date(at.getTime() + 6 * DAY).toISOString(),
      resolvedAt: ago(DAY),
      createdAt: ago(3 * DAY),
      contexts: [],
      messages: [],
      customerReadSeq: 0,
    };
    conversations.push(resolved);
    post(resolved, {
      kind: "TEXT",
      visibility: "CUSTOMER",
      senderType: "CUSTOMER",
      senderId: deps.customerId,
      senderName: "Bạn",
      body: "Ly giấy 2 lớp 12oz có in được logo 2 màu không ạ?",
      sentAt: ago(3 * DAY),
    });
    post(resolved, {
      kind: "TEXT",
      visibility: "CUSTOMER",
      senderType: "AGENT",
      ...agent,
      body: "Dạ được ạ. Anh/chị tự thiết kế trên app rồi gửi duyệt, bên em báo giá ngay khi bản được duyệt.",
      sentAt: ago(3 * DAY - HOUR),
    });
    resolved.customerReadSeq = 2;
    post(resolved, {
      ...sys,
      kind: "CARD",
      body: "Mời bạn đánh giá cuộc trò chuyện",
      card: {
        kind: "CSAT_SURVEY",
        state: "OPEN",
        payload: { conversationId: resolved.id, scale: 5 },
      },
      sentAt: ago(DAY),
    });

    const closed: StoredConversation = {
      id: MOCK_CHAT_IDS.closedThread,
      customerId: deps.customerId,
      subject: "Đổi địa chỉ giao hàng",
      status: "CLOSED",
      agentOnline: false,
      assigned: true,
      reopenUntil: ago(10 * DAY),
      resolvedAt: ago(17 * DAY),
      createdAt: ago(18 * DAY),
      contexts: [],
      messages: [],
      customerReadSeq: 0,
      csatScore: 5,
      csatSubmittedAt: ago(17 * DAY),
    };
    conversations.push(closed);
    attach(closed, "ORDER", MOCK_CONTRACT_ORDER_IDS.signed);
    post(closed, {
      kind: "TEXT",
      visibility: "CUSTOMER",
      senderType: "CUSTOMER",
      senderId: deps.customerId,
      senderName: "Bạn",
      body: "Mình muốn đổi địa chỉ giao sang kho Bình Dương.",
      sentAt: ago(18 * DAY),
    });
    post(closed, {
      kind: "TEXT",
      visibility: "CUSTOMER",
      senderType: "AGENT",
      ...agent,
      body: "Dạ em đã cập nhật địa chỉ giao cho đơn hàng rồi ạ.",
      sentAt: ago(17 * DAY),
    });
    closed.customerReadSeq = 2;

    conversations.push({
      id: MOCK_CHAT_IDS.foreignThread,
      customerId: MOCK_OTHER_CUSTOMER_ID,
      subject: "Cuộc trò chuyện của khách khác",
      status: "ACTIVE",
      agentOnline: true,
      assigned: true,
      createdAt: ago(DAY),
      contexts: [
        {
          id: newId(),
          kind: "QUOTE",
          refId: MOCK_FOREIGN_CONTEXT_ID,
          primary: true,
          attachedAt: ago(DAY),
        },
      ],
      messages: [],
      customerReadSeq: 0,
    });
  }

  /* ── C1–C14 ────────────────────────────────────────────────────────── */

  function open(body: Payload = {}): MockResult {
    ensureSeeded();
    const kind = body.contextKind ?? undefined;
    const refId = body.contextId ?? undefined;
    if ((kind === undefined) !== (refId === undefined)) {
      return fail(400, "VALIDATION_FAILED", "Ngữ cảnh gồm loại và mã chứng từ.");
    }
    if (kind !== undefined && (!isText(kind) || !CHAT_CONTEXT_KINDS.includes(kind))) {
      return fail(400, "MALFORMED_REQUEST", "Loại chứng từ không hợp lệ.");
    }
    if (
      isText(kind) &&
      (!isText(refId) || refId === MOCK_FOREIGN_CONTEXT_ID || !deps.owns(kind, refId))
    ) {
      return fail(
        404,
        "CHAT_CONTEXT_NOT_FOUND",
        "Không tìm thấy chứng từ này trong tài khoản của bạn.",
      );
    }
    if (body.text !== undefined && body.text !== null) {
      const text = validText(body.text);
      if (!isText(text)) return text;
    }
    let c =
      isText(kind) && isText(refId)
        ? openAbout(kind, refId)
        : conversations
            .filter(
              (candidate) =>
                isMine(candidate) && isOpen(candidate) && candidate.contexts.length === 0,
            )
            .sort(byActivity)[0];
    if (!c) {
      c = newConversation(
        isText(body.subject) && body.subject.trim() ? body.subject.trim() : undefined,
      );
      if (isText(kind) && isText(refId)) {
        const described = deps.describe?.(kind, refId) ?? null;
        attach(c, kind, refId, described?.label, described?.status);
      }
    }
    if (body.text !== undefined && body.text !== null) {
      const sent = sendText(c, body.text, body.clientMessageId);
      if (sent.status >= 400) return sent;
    }
    return ok(conversationView(c, true), 201);
  }

  function list(query: Payload = {}): MockResult {
    ensureSeeded();
    const kind = query.contextKind;
    const refId = query.contextId;
    if ((kind === undefined) !== (refId === undefined)) {
      return fail(400, "VALIDATION_FAILED", "Ngữ cảnh gồm loại và mã chứng từ.");
    }
    const page = Math.max(0, Math.trunc(num(query.page) ?? 0));
    const size = clamp(Math.trunc(num(query.size) ?? 20), 1, 100);
    const rows = conversations
      .filter(isMine)
      .filter(
        (c) => kind === undefined || c.contexts.some((x) => x.kind === kind && x.refId === refId),
      )
      .map((c) => {
        materializeReply(c);
        return c;
      })
      .sort(byActivity);
    const totalPages = Math.ceil(rows.length / size);
    return ok({
      items: rows.slice(page * size, (page + 1) * size).map((c) => conversationView(c, false)),
      page,
      size,
      totalElements: rows.length,
      totalPages,
      hasNext: page + 1 < totalPages,
      hasPrevious: page > 0,
    });
  }

  function get(id: string): MockResult {
    const c = mine(id);
    return c ? ok(conversationView(c, true)) : notFound();
  }

  function messages(id: string, query: Payload = {}): MockResult {
    const c = mine(id);
    if (!c) return notFound();
    const shown = visible(c);
    const limit = clamp(Math.trunc(num(query.limit) ?? 30), 1, 100);
    const since = num(query.since);
    if (since !== undefined) {
      const after = shown.filter((m) => m.seq > Math.max(0, since));
      const page = after.slice(0, limit);
      const more = after.length > limit;
      return ok({
        items: page.map((m) => messageView(m, c.id)),
        ...(more ? { nextSince: page.at(-1)?.seq } : {}),
        lastSeq: lastSeqOf(c),
      });
    }
    const before = num(query.before);
    const older = shown.filter((m) => before === undefined || m.seq < before).reverse();
    const page = older.slice(0, limit);
    const more = older.length > limit;
    return ok({
      items: page.map((m) => messageView(m, c.id)),
      ...(more ? { nextBefore: page.at(-1)?.seq } : {}),
      lastSeq: lastSeqOf(c),
    });
  }

  function send(id: string, body: Payload = {}): MockResult {
    const c = mine(id);
    return c ? sendText(c, body.text, body.clientMessageId) : notFound();
  }

  function sendFile(
    id: string,
    form: { file: Blob | null; fileName?: string; caption?: unknown; clientMessageId?: unknown },
  ): MockResult {
    const c = mine(id);
    if (!c) return notFound();
    if (pastWindow(c)) {
      return fail(
        409,
        "CHAT_CONVERSATION_ENDED",
        "Cuộc trò chuyện đã kết thúc. Hãy mở lại để tiếp tục.",
      );
    }
    const file = form.file;
    if (!file) return fail(400, "VALIDATION_FAILED", "Chưa chọn file để gửi.");
    if (file.size > CHAT_FILE_MAX) return fail(413, "PAYLOAD_TOO_LARGE", "File vượt quá 20 MB.");
    if (!CHAT_FILE_TYPES.includes(file.type)) {
      return fail(415, "UNSUPPORTED_MEDIA_TYPE", "Chỉ gửi được ảnh JPEG, PNG, WebP hoặc file PDF.");
    }
    if (file.size === 0) return fail(400, "VALIDATION_FAILED", "File rỗng.");
    let caption: string | undefined;
    if (isText(form.caption) && form.caption.trim()) {
      const text = validText(form.caption);
      if (!isText(text)) return text;
      caption = text;
    }
    const clientMessageId =
      isText(form.clientMessageId) && form.clientMessageId ? form.clientMessageId : undefined;
    const same = clientMessageId
      ? c.messages.find((m) => m.clientMessageId === clientMessageId)
      : undefined;
    if (same) return ok(messageView(same, c.id), 201);
    const attachmentId = newId();
    const fileName = form.fileName ?? "tep-dinh-kem";
    const url =
      typeof URL.createObjectURL === "function"
        ? URL.createObjectURL(file)
        : `about:blank#${encodeURIComponent(fileName)}`;
    const message = post(c, {
      kind: "ATTACHMENT",
      visibility: "CUSTOMER",
      senderType: "CUSTOMER",
      senderId: deps.customerId,
      senderName: "Bạn",
      ...(caption ? { body: caption } : {}),
      ...(clientMessageId ? { clientMessageId } : {}),
      attachments: [
        { id: attachmentId, fileName, contentType: file.type, sizeBytes: file.size, url },
      ],
    });
    customerWrote(c);
    return ok(messageView(message, c.id), 201);
  }

  function link(id: string, attachmentId: string): MockResult {
    const c = mine(id);
    if (!c) return notFound();
    const found = visible(c)
      .filter((m) => !m.deleted)
      .flatMap((m) => m.attachments)
      .find((a) => a.id === attachmentId);
    return found
      ? ok({ url: found.url, expiresAt: new Date(now().getTime() + 10 * 60_000).toISOString() })
      : fail(404, "CHAT_MESSAGE_NOT_FOUND", "Không tìm thấy file.");
  }

  function read(id: string, body: Payload = {}): MockResult {
    const c = mine(id);
    if (!c) return notFound();
    const newest = lastSeqOf(c);
    const asked = num(body.seq);
    const target = asked === undefined ? newest : Math.min(asked, newest);
    c.customerReadSeq = Math.max(c.customerReadSeq, target);
    return ok({
      conversationId: c.id,
      userId: deps.customerId,
      side: "CUSTOMER",
      seq: c.customerReadSeq,
      at: now().toISOString(),
    });
  }

  function reopen(id: string): MockResult {
    const c = mine(id);
    if (!c) return notFound();
    if (isOpen(c)) return ok(conversationView(c, true));
    if (!pastWindow(c)) {
      c.status = "REOPENED";
      return ok(conversationView(c, true));
    }
    const next = newConversation(c.subject, c.id);
    for (const context of c.contexts) {
      if (deps.owns(context.kind, context.refId)) {
        attach(next, context.kind, context.refId, context.label, context.status);
      }
    }
    return ok(conversationView(next, true));
  }

  function rateConversation(
    c: StoredConversation,
    rawScore: unknown,
    rawComment: unknown,
  ): MockResult {
    if (c.csatScore !== undefined)
      return fail(409, "CHAT_CSAT_ALREADY_GIVEN", "Bạn đã đánh giá cuộc trò chuyện này.");
    if (c.status !== "RESOLVED")
      return fail(
        409,
        "CHAT_CSAT_NOT_OPEN",
        "Cuộc trò chuyện chưa kết thúc nên chưa đánh giá được.",
      );
    const score = num(rawScore);
    if (score === undefined || !Number.isInteger(score) || score < 1 || score > 5) {
      return fail(400, "VALIDATION_FAILED", "Đánh giá từ 1 đến 5 sao.");
    }
    if (isText(rawComment) && rawComment.length > 2000) {
      return fail(400, "VALIDATION_FAILED", "Nhận xét tối đa 2000 ký tự.");
    }
    c.csatScore = score;
    c.csatSubmittedAt = now().toISOString();
    for (const m of c.messages) {
      if (m.card?.kind === "CSAT_SURVEY" && m.card.state === "OPEN") {
        m.card = {
          ...m.card,
          state: "ACTED",
          payload: { ...m.card.payload, score },
          updatedAt: now().toISOString(),
        };
      }
    }
    return ok(conversationView(c, true));
  }

  function rate(id: string, body: Payload = {}): MockResult {
    const c = mine(id);
    return c ? rateConversation(c, body.score, body.comment) : notFound();
  }

  function act(id: string, messageId: string, body: Payload = {}): MockResult {
    const c = mine(id);
    if (!c) return notFound();
    const message = visible(c).find((m) => m.id === messageId && m.card && !m.deleted);
    const card = message?.card;
    if (!message || !card) return fail(404, "CHAT_MESSAGE_NOT_FOUND", "Không tìm thấy thẻ này.");
    const action = isText(body.action) ? body.action.trim().toUpperCase() : "";
    if (action === "CREATE_QUOTE") {
      return fail(409, "CHAT_CARD_ACTION_NOT_ALLOWED", "Thao tác này do nhân viên thực hiện.");
    }
    if (!cardActionsOf(card).customer.includes(action)) {
      return fail(409, "CHAT_CARD_ACTION_NOT_ALLOWED", "Thẻ này không còn thao tác đó.");
    }
    if (action === "RATE") {
      const rated = rateConversation(c, body.score, body.comment);
      return rated.status >= 400 ? rated : ok(messageView(message, c.id));
    }
    if (action === "REQUEST_CHANGES" && !(isText(body.note) && body.note.trim())) {
      return fail(400, "VALIDATION_FAILED", "Vui lòng ghi rõ nội dung cần sửa của báo giá.");
    }
    if (card.kind === "SAMPLE_APPROVAL") {
      // BE ChatCardActions: APPROVE, or REQUEST_REPRINT with a required note, answers the round.
      if (action === "REQUEST_REPRINT" && !(isText(body.note) && body.note.trim())) {
        return fail(400, "VALIDATION_FAILED", "Vui lòng ghi rõ điểm cần in lại mẫu.");
      }
      const answeredAt = now().toISOString();
      card.payload = {
        ...card.payload,
        status: action === "APPROVE" ? "APPROVED" : "REPRINT_REQUESTED",
        answeredAt,
      };
      card.state = "ACTED";
      card.updatedAt = answeredAt;
      return ok(messageView(message, c.id));
    }
    if (card.kind !== "QUOTE" || (action !== "ACCEPT" && action !== "REQUEST_CHANGES")) {
      return fail(409, "CHAT_CARD_ACTION_NOT_ALLOWED", "Thẻ này không còn thao tác đó.");
    }
    const quoteId = String(card.payload.quoteId);
    const version = num(body.version) ?? num(card.payload.version) ?? 0;
    const cartons =
      body.cartons && typeof body.cartons === "object"
        ? Object.fromEntries(
            Object.entries(body.cartons as Payload).map(([lineId, n]) => [lineId, Number(n)]),
          )
        : undefined;
    const known = deps.quotePayload?.(quoteId) ?? null;
    if (known && deps.quoteAction) {
      const result = deps.quoteAction(quoteId, action, {
        version,
        ...(cartons ? { cartons } : {}),
        ...(isText(body.note) ? { note: body.note.trim() } : {}),
      });
      if (result.status >= 400) return result;
      card.payload = deps.quotePayload?.(quoteId) ?? card.payload;
    } else {
      const local = localQuoteAction(
        card.payload,
        action,
        { version, ...(cartons ? { cartons } : {}) },
        now(),
      );
      if (!local.ok) return fail(local.status, local.code, local.message, local.details);
      card.payload = local.payload;
    }
    card.state = cardStateOfQuote(String(card.payload.status)) ?? "ACTED";
    card.updatedAt = now().toISOString();
    return ok(messageView(message, c.id));
  }

  function changeOwn(
    id: string,
    messageId: string,
    change: (m: StoredMessage) => MockResult | null,
  ): MockResult {
    const c = mine(id);
    if (!c) return notFound();
    const m = visible(c).find((candidate) => candidate.id === messageId);
    if (!m) return fail(404, "CHAT_MESSAGE_NOT_FOUND", "Không tìm thấy tin nhắn.");
    if (c.status === "CLOSED")
      return fail(409, "CHAT_CONVERSATION_ENDED", "Cuộc trò chuyện đã kết thúc.");
    if (m.senderType !== "CUSTOMER" || m.deleted) {
      return fail(409, "CHAT_MESSAGE_NOT_EDITABLE", "Tin nhắn này không sửa hoặc thu hồi được.");
    }
    if (now().getTime() - new Date(m.sentAt).getTime() >= EDIT_WINDOW_MS) {
      return fail(409, "CHAT_EDIT_WINDOW_PASSED", "Đã quá 5 phút kể từ khi gửi.");
    }
    return change(m) ?? ok(messageView(m, c.id));
  }

  const edit = (id: string, messageId: string, body: Payload = {}) =>
    changeOwn(id, messageId, (m) => {
      if (m.kind !== "TEXT")
        return fail(409, "CHAT_MESSAGE_NOT_EDITABLE", "Chỉ sửa được tin nhắn chữ.");
      const text = validText(body.text);
      if (!isText(text)) return text;
      m.body = text;
      m.editedAt = now().toISOString();
      return null;
    });

  const remove = (id: string, messageId: string) =>
    changeOwn(id, messageId, (m) => {
      if (m.kind !== "TEXT" && m.kind !== "ATTACHMENT") {
        return fail(409, "CHAT_MESSAGE_NOT_EDITABLE", "Thẻ không thu hồi được.");
      }
      m.deleted = true;
      delete m.body;
      m.attachments = [];
      return null;
    });

  function unread(): MockResult {
    ensureSeeded();
    const mineAll = conversations.filter(isMine);
    mineAll.forEach(materializeReply);
    const counts = mineAll.map(unreadOf);
    return ok({
      conversations: counts.filter((n) => n > 0).length,
      messages: counts.reduce((sum, n) => sum + n, 0),
    });
  }

  /* ── Document events (B.6 routing, B.7 states) ─────────────────────── */

  const cardsOf = (kind: string, field: string, value: string) =>
    conversations
      .filter(isMine)
      .flatMap((c) => c.messages.map((m) => ({ c, m })))
      .filter(({ m }) => m.card?.kind === kind && m.card.payload[field] === value);

  function quoteRequested(scope: "DESIGN" | "DESIGN_PROJECT", payload: Payload) {
    const requestId = String(payload.requestId ?? "");
    const refId = String((scope === "DESIGN" ? payload.designId : payload.projectId) ?? "");
    const name = String((scope === "DESIGN" ? payload.designName : payload.projectName) ?? "");
    const existing = cardsOf("QUOTE_REQUEST", "requestId", requestId)[0];
    if (existing?.m.card) {
      const card = existing.m.card;
      const fresh: Payload = { ...payload };
      if (card.payload.quoteId) {
        fresh.quoteId = card.payload.quoteId;
        fresh.quoteNumber = card.payload.quoteNumber;
      }
      const closed =
        (fresh.requestStatus ?? fresh.status) === "CLOSED" || fresh.designStatus === "ARCHIVED";
      existing.m.card = {
        ...card,
        payload: fresh,
        state: card.state === "OPEN" && closed ? "CLOSED" : card.state,
        updatedAt: now().toISOString(),
      };
      return;
    }
    const c = routeCard(scope, refId, name);
    post(c, {
      kind: "CARD",
      visibility: "CUSTOMER",
      senderType: "SYSTEM",
      body: scope === "DESIGN" ? `Yêu cầu báo giá: ${name}` : `Yêu cầu báo giá cả dự án: ${name}`,
      card: { kind: "QUOTE_REQUEST", state: "OPEN", payload: { ...payload } },
    });
  }

  function quoteChanged(quoteId: string) {
    const fresh = deps.quotePayload?.(quoteId) ?? null;
    if (!fresh) return;
    const cards = cardsOf("QUOTE", "quoteId", quoteId).sort((a, b) => a.m.seq - b.m.seq);
    const revision = fresh.revision;
    const same = cards.filter(({ m }) => m.card?.payload.revision === revision).at(-1);
    if (fresh.status === "SENT" && !same) {
      for (const { m } of cards) {
        if (m.card?.state === "OPEN")
          m.card = { ...m.card, state: "SUPERSEDED", updatedAt: now().toISOString() };
      }
      const c = routeCard("QUOTE", quoteId, isText(fresh.number) ? fresh.number : undefined);
      post(c, {
        kind: "CARD",
        visibility: "CUSTOMER",
        senderType: "AGENT",
        senderId: MOCK_AGENT.id,
        senderName: MOCK_AGENT.name,
        body: `Báo giá ${String(fresh.number ?? "")}`,
        card: { kind: "QUOTE", state: "OPEN", payload: fresh },
      });
      return;
    }
    const target = same ?? cards.at(-1);
    if (!target?.m.card) return;
    const state = cardStateOfQuote(String(fresh.status));
    target.m.card = {
      ...target.m.card,
      payload: fresh,
      state: state && target.m.card.state === "OPEN" ? state : target.m.card.state,
      updatedAt: now().toISOString(),
    };
  }

  function onEvent(event: MockChatEvent) {
    ensureSeeded();
    if (event.type === "QUOTE_CHANGED") quoteChanged(event.quoteId);
    else if (event.type === "DESIGN_QUOTE_REQUESTED") quoteRequested("DESIGN", event.payload);
    else quoteRequested("DESIGN_PROJECT", event.payload);
  }

  return {
    open,
    list,
    get,
    messages,
    send,
    sendFile,
    link,
    read,
    reopen,
    act,
    rate,
    edit,
    remove,
    unread,
    onEvent,
    /** Tests: post a message as Sales or the system, internal notes included. */
    postAs(
      id: string,
      message: Pick<StoredMessage, "kind" | "visibility" | "senderType"> & Partial<StoredMessage>,
    ) {
      ensureSeeded();
      const c = conversations.find((candidate) => candidate.id === id);
      return c ? post(c, message) : null;
    },
  };
}

/** BE `DocumentCards.quoteChanged`: the quote's status → its latest card's state. */
function cardStateOfQuote(status: string): string | null {
  switch (status) {
    case "ACCEPTED":
    case "CHANGES_REQUESTED":
    case "CONVERTED":
      return "ACTED";
    case "EXPIRED":
      return "EXPIRED";
    case "CANCELLED":
      return "CANCELLED";
    default:
      return null;
  }
}
