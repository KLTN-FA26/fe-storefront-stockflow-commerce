/**
 * Seed and stand-in card payloads of the chat mock (plan Phụ lục B §B.7). The QUOTE and CONTRACT
 * cards are read from the quote and contract mocks when those answer; until they do (or for a
 * document they do not know), the local payloads below keep the demo story whole — DS-02a numbers:
 * 60 cartons × 1.000 × 1.150 đ + plate fee 1.500.000 + VAT 8% = 76.140.000 đ.
 *
 * Mock layer only.
 */

import { MOCK_CONTRACT_ORDER_IDS, MOCK_QUOTE_IDS } from "./wf02";

const DAY = 86_400_000;
const isoDate = (at: Date) => at.toISOString().slice(0, 10);

export const MOCK_CHAT_IDS = {
  /** "Báo giá ly logo xanh": the four WF-02 cards and one internal note. */
  quoteThread: "c4a70000-0000-4000-8000-000000000001",
  /** Resolved, inside its reopen window, with an open CSAT survey. */
  resolvedThread: "c4a70000-0000-4000-8000-000000000002",
  /** Closed for good: writing again starts a new conversation (C9). */
  closedThread: "c4a70000-0000-4000-8000-000000000003",
  /** Another customer's: answers 404 to this customer. */
  foreignThread: "c4a70000-0000-4000-8000-000000000009",
} as const;

/** The approved design of the demo customer the quote request card is about. */
export const MOCK_CHAT_DESIGN_ID = "de510000-0000-4000-8000-000000000001";
/** A document of another customer: every context check refuses it (16 BR-02). */
export const MOCK_FOREIGN_CONTEXT_ID = "f0e10000-0000-4000-8000-000000000099";
export const MOCK_OTHER_CUSTOMER_ID = "c0ffee00-0000-4000-8000-000000000099";

export const MOCK_AGENT = {
  id: "5a1e5000-0000-4000-8000-000000000001",
  name: "Nguyễn Minh (Sale)",
};

/** The quote mock's MOQ and price tiers for the demo SKU (plan §0.2): 20 / 50 / 100 cartons. */
export const MOCK_LOCAL_MOQ = 20;
const UNITS_PER_CARTON = 1000;
const PLATE_FEE = 1_500_000;
const VAT = 0.08;
const tierPrice = (cartons: number) => (cartons >= 100 ? 1050 : cartons >= 50 ? 1150 : 1250);

export const MOCK_QUOTE_LINE_ID = "5a1e1100-0000-4000-8000-000000000001";
/** The number the quote mock gives `MOCK_QUOTE_IDS.sent` (mock-fixtures/quotes.ts). */
const QUOTE_NUMBER = "QT-20261118-0105";

function quoteTotals(cartons: number) {
  const lineTotal = cartons * UNITS_PER_CARTON * tierPrice(cartons);
  const subtotal = lineTotal + PLATE_FEE;
  return { lineTotal, total: Math.round(subtotal * (1 + VAT)) };
}

/** B.7.3 QUOTE payload of the demo quote, SENT, as the quote module would post it. */
export function localQuotePayload(now: Date): Record<string, unknown> {
  const cartons = 60;
  const { lineTotal, total } = quoteTotals(cartons);
  return {
    id: MOCK_QUOTE_IDS.sent,
    quoteId: MOCK_QUOTE_IDS.sent,
    number: QUOTE_NUMBER,
    status: "SENT",
    revision: 1,
    validUntil: new Date(now.getTime() + 14 * DAY).toISOString(),
    requestedDeliveryDate: isoDate(new Date(now.getTime() + 21 * DAY)),
    lines: [
      {
        id: MOCK_QUOTE_LINE_ID,
        lineNo: 1,
        sku: "LY-GIAY-DEMO-12OZ-XANH",
        cartons,
        unitsPerCarton: UNITS_PER_CARTON,
        units: cartons * UNITS_PER_CARTON,
        unitPrice: tierPrice(cartons),
        lineTotal,
      },
    ],
    proposedTotal: total,
    sentAt: new Date(now.getTime() - DAY).toISOString(),
    version: 3,
    currency: "VND",
  };
}

type Lines = Array<Record<string, unknown> & { id: string; lineNo: number; sku: string }>;

/** What the quote module would answer to a card action on the local quote (A.1 rules). */
export function localQuoteAction(
  payload: Record<string, unknown>,
  action: "ACCEPT" | "REQUEST_CHANGES",
  body: { version: number; cartons?: Record<string, unknown> },
  now: Date,
):
  | { ok: true; payload: Record<string, unknown> }
  | {
      ok: false;
      status: number;
      code: string;
      message: string;
      details?: Record<string, unknown>;
    } {
  if (payload.status !== "SENT") {
    return {
      ok: false,
      status: 409,
      code: "INVALID_QUOTE_TRANSITION",
      message: "Báo giá không còn chờ bạn trả lời.",
    };
  }
  if (typeof payload.validUntil === "string" && new Date(payload.validUntil) <= now) {
    return {
      ok: false,
      status: 409,
      code: "QUOTE_EXPIRED",
      message: "Báo giá đã hết hiệu lực, vui lòng liên hệ Sale để lập báo giá mới.",
    };
  }
  if (body.version !== payload.version) {
    return {
      ok: false,
      status: 409,
      code: "OPTIMISTIC_LOCK",
      message: "Báo giá vừa được cập nhật, vui lòng xem lại bản mới nhất.",
    };
  }
  const version = Number(payload.version) + 1;
  if (action === "REQUEST_CHANGES") {
    return { ok: true, payload: { ...payload, status: "CHANGES_REQUESTED", version } };
  }
  const lines = (payload.lines as Lines).map((line) => ({ ...line }));
  let accepted = 0;
  for (const line of lines) {
    const asked = body.cartons?.[line.id] ?? line.cartons;
    if (typeof asked !== "number" || !Number.isInteger(asked) || asked < 1) {
      return {
        ok: false,
        status: 400,
        code: "VALIDATION_FAILED",
        message: `Dòng ${line.lineNo}: số thùng phải là số nguyên từ 1.`,
      };
    }
    if (asked < MOCK_LOCAL_MOQ) {
      return {
        ok: false,
        status: 409,
        code: "QUOTE_BELOW_MOQ",
        message: `Dòng ${line.lineNo} (${line.sku}): ${asked} thùng thấp hơn số lượng đặt tối thiểu (MOQ) là ${MOCK_LOCAL_MOQ} thùng.`,
        details: { lineNo: line.lineNo, sku: line.sku, cartons: asked, moq: MOCK_LOCAL_MOQ },
      };
    }
    const { total } = quoteTotals(asked);
    line.acceptedCartons = asked;
    accepted = total;
  }
  return {
    ok: true,
    payload: { ...payload, lines, status: "ACCEPTED", acceptedTotal: accepted, version },
  };
}

/** B.7.4 CONTRACT payload of the SENT contract of `MOCK_CONTRACT_ORDER_IDS.sent`. */
export function localContractPayload(now: Date): Record<string, unknown> {
  const orderId = MOCK_CONTRACT_ORDER_IDS.sent;
  return {
    id: "c0e70000-0000-4000-8000-000000000001",
    contractId: "c0e70000-0000-4000-8000-000000000001",
    number: "HD-20261118-000001-1",
    orderId,
    orderNumber: "SO-20261118-000001",
    status: "SENT",
    totalAmount: 76_140_000,
    currency: "VND",
    freeSampleRounds: 1,
    paymentPlan: [
      {
        seq: 1,
        name: "Đặt cọc 30%",
        milestone: "ON_SIGNING",
        amount: 22_842_000,
        percent: 30,
        dueDays: 7,
      },
      {
        seq: 2,
        name: "Thanh toán trước giao đợt 1",
        milestone: "BEFORE_DELIVERY",
        amount: 22_842_000,
        percent: 30,
        deliveryBatchSeq: 1,
      },
      {
        seq: 3,
        name: "Thanh toán sau giao 30 ngày",
        milestone: "AFTER_DELIVERY",
        amount: 30_456_000,
        percent: 40,
        dueDays: 30,
        deliveryBatchSeq: 2,
      },
    ],
    sentAt: new Date(now.getTime() - 3 * 3_600_000).toISOString(),
    version: 2,
    documentPath: `/api/v1/orders/me/${orderId}/contract/document`,
  };
}

/** B.7.5 PAYMENT_INFO payload: the deposit of the signed order, still owed. */
export function localTransferPayload(
  now: Date,
  contract: Record<string, unknown> | null,
): Record<string, unknown> {
  const contractNumber =
    typeof contract?.number === "string" ? contract.number : "HD-20261102-000014-1";
  return {
    installmentId: "1a5e0000-0000-4000-8000-000000000001",
    contractId:
      typeof contract?.contractId === "string"
        ? contract.contractId
        : "c0e70000-0000-4000-8000-000000000002",
    contractNumber,
    orderId: MOCK_CONTRACT_ORDER_IDS.signed,
    orderNumber:
      typeof contract?.orderNumber === "string" ? contract.orderNumber : "SO-20261102-000014",
    seq: 1,
    name: "Đặt cọc 30%",
    amount: 22_842_000,
    installmentAmount: 22_842_000,
    currency: "VND",
    dueDate: isoDate(new Date(now.getTime() + 7 * DAY)),
    overdue: false,
    status: "DUE",
    transferContent: `${contractNumber} DOT1`,
    reminder: false,
    bank: {
      bankName: "Vietcombank — CN Hồ Chí Minh",
      bankBin: "970436",
      accountNumber: "0071000123456",
      accountName: "CONG TY TNHH STOCKFLOW",
    },
    vietQr: null,
  };
}

/** B.7.1 QUOTE_REQUEST, design scope: Sales already drew the quote up from it (ACTED). */
export function localDesignRequestPayload(now: Date): Record<string, unknown> {
  return {
    scope: "DESIGN",
    requestId: "d5e00000-0000-4000-8000-000000000001",
    designId: MOCK_CHAT_DESIGN_ID,
    designName: "Ly giấy 12oz logo xanh",
    designStatus: "APPROVED",
    sku: "CUP-PAPER-12OZ-WHT",
    customerSku: "LY-GIAY-DEMO-12OZ-XANH",
    returnReason: null,
    cartons: 60,
    desiredDeliveryDate: isoDate(new Date(now.getTime() + 21 * DAY)),
    requestStatus: "CLOSED",
    requestedAt: new Date(now.getTime() - 2 * DAY).toISOString(),
    quoteId: MOCK_QUOTE_IDS.sent,
    quoteNumber: QUOTE_NUMBER,
  };
}
