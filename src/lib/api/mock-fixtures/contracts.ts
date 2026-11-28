/**
 * The customer's copy of an order's sales contract, mirroring BE CustomerSalesContractController
 * (GET /orders/me/{orderId}/contract, /document) and the CONTRACT chat card payload (plan Phụ lục
 * A.2, B.7.4):
 *  - another customer's order answers 404 NOT_FOUND; an order with no contract sent (none, or a
 *    draft) answers 404 SALES_CONTRACT_NOT_FOUND;
 *  - the customer's copy names no back-office actor and never carries `creditWarning`;
 *  - /document links the signed file once signed, else the PDF as sent.
 * Two contracts are seeded: SENT on the order awaiting its contract (DS-02a: 2 delivery batches of
 * 30 cartons, 3 installments) and SIGNED on the seeded PENDING_PAYMENT order, whose plan is the
 * installments that order already has (installments.ts).
 * NON_NULL serialisation: absent optional fields are omitted, never sent as null.
 */

import { mockContractNumber, mockInstallmentsOf } from "./installments";
import type { MockOrder, MockResult } from "./orders";

const ok = (data: unknown): MockResult => ({
  status: 200,
  data: { success: true, data, timestamp: new Date().toISOString() },
});

const fail = (status: number, errorCode: string, message: string): MockResult => ({
  status,
  data: {
    success: false,
    errorCode,
    message,
    correlationId: `mock-contract-${Date.now()}`,
    timestamp: new Date().toISOString(),
  },
});

export interface MockContractBatch {
  seq: number;
  windowStart?: string;
  windowEnd?: string;
  value: number;
  lines: Array<{ orderLineId: string; sku: string; cartons: number; units: number }>;
}

export interface MockContractInstallment {
  seq: number;
  name: string;
  milestone: "ON_SIGNING" | "BEFORE_DELIVERY" | "AFTER_DELIVERY";
  percent?: number;
  amount: number;
  dueDays?: number;
  deliveryBatchSeq?: number;
}

/** SalesContracts.ContractView, the customer's copy. */
export interface MockContract {
  id: string;
  contractNumber: string;
  orderId: string;
  orderNumber: string;
  status: "DRAFT" | "SENT" | "SIGNED" | "COMPLETED" | "CANCELLED";
  seller: { name: string; taxCode?: string; address?: string; representative?: string };
  buyer: { name: string; taxCode?: string; address?: string; representative?: string };
  freeSampleRounds: number;
  totals: { netAmount: number; taxAmount: number; totalAmount: number; currency: "VND" };
  deliverySchedule: MockContractBatch[];
  paymentPlan: MockContractInstallment[];
  sentAt?: string;
  signedOn?: string;
  signedFileName?: string;
  signedAt?: string;
  returnWindowDays?: number;
  /** BE 81214e74: a delivery window in force differs from the one signed. */
  appendixAvailable: boolean;
  version: number;
}

const SELLER = {
  name: "Công ty TNHH StockFlow",
  taxCode: "0312345678",
  address: "12 Nguyễn Huệ, Phường Sài Gòn, TP. Hồ Chí Minh",
  representative: "Trần Minh Quân",
};
const BUYER = {
  name: "Khách hàng demo",
  taxCode: "0398765432",
  address: "45 Lê Lợi, Phường Bến Thành, TP. Hồ Chí Minh",
  representative: "Nguyễn Hoài Nam",
};

const DAY = 86_400_000;
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * DS-02a's contract (plan §3 step 7, 9): 60 cartons in two batches of 30, a 30 % deposit on signing,
 * before-delivery tied to batch 1, 30 days after delivery tied to batch 2 — 76.140.000 đ in all.
 */
export function mockSentContract(order: MockOrder, now: Date): MockContract {
  const line = order.lines[0]!;
  const cartons = 60;
  const perCarton = line.quantity / cartons;
  const batchNet = 30 * perCarton * line.unitPrice;
  const batchValue = batchNet + Math.round(batchNet * 0.08);
  const batch = (seq: number, fromDays: number): MockContractBatch => ({
    seq,
    windowStart: isoDay(now.getTime() + fromDays * DAY),
    windowEnd: isoDay(now.getTime() + (fromDays + 2) * DAY),
    value: batchValue,
    lines: [{ orderLineId: line.lineId, sku: line.sku, cartons: 30, units: 30 * perCarton }],
  });
  const total = order.totalAmount;
  const deposit = Math.round(total * 0.3);
  const rest = total - deposit;
  return {
    id: "c0a70000-0000-4000-8000-000000000001",
    contractNumber: mockContractNumber(order),
    orderId: order.orderId,
    orderNumber: order.orderNumber,
    status: "SENT",
    seller: SELLER,
    buyer: BUYER,
    freeSampleRounds: 2,
    totals: { netAmount: 70_500_000, taxAmount: 5_640_000, totalAmount: total, currency: "VND" },
    deliverySchedule: [batch(1, 21), batch(2, 35)],
    paymentPlan: [
      { seq: 1, name: "Đặt cọc khi ký", milestone: "ON_SIGNING", percent: 30, amount: deposit },
      {
        seq: 2,
        name: "Thanh toán trước giao đợt 1",
        milestone: "BEFORE_DELIVERY",
        percent: 35,
        amount: Math.round(rest / 2),
        deliveryBatchSeq: 1,
      },
      {
        seq: 3,
        name: "Thanh toán sau giao đợt 2",
        milestone: "AFTER_DELIVERY",
        percent: 35,
        amount: rest - Math.round(rest / 2),
        dueDays: 30,
        deliveryBatchSeq: 2,
      },
    ],
    sentAt: new Date(now.getTime() - DAY).toISOString(),
    returnWindowDays: 7,
    appendixAvailable: false,
    version: 3,
  };
}

/** A signed contract whose plan is the installments the order already has (installments.ts). */
export function mockSignedContract(order: MockOrder): MockContract {
  const installments = mockInstallmentsOf(order) ?? [];
  const tax = Math.round(order.totalAmount - order.totalAmount / 1.08);
  const signedAt = order.placedAt;
  return {
    id: "c0a70000-0000-4000-8000-000000000002",
    contractNumber: mockContractNumber(order),
    orderId: order.orderId,
    orderNumber: order.orderNumber,
    status: "SIGNED",
    seller: SELLER,
    buyer: BUYER,
    freeSampleRounds: 2,
    totals: {
      netAmount: order.totalAmount - tax,
      taxAmount: tax,
      totalAmount: order.totalAmount,
      currency: "VND",
    },
    deliverySchedule: [
      {
        seq: 1,
        windowStart: isoDay(Date.parse(order.placedAt) + 14 * DAY),
        windowEnd: isoDay(Date.parse(order.placedAt) + 14 * DAY),
        value: order.totalAmount,
        lines: order.lines.map((line) => ({
          orderLineId: line.lineId,
          sku: line.sku,
          cartons: line.quantity,
          units: line.quantity,
        })),
      },
    ],
    paymentPlan: installments.map((installment) => ({
      seq: installment.seq,
      name: installment.name,
      milestone: installment.milestone,
      amount: installment.amount,
      ...(installment.dueDays !== undefined ? { dueDays: installment.dueDays } : {}),
    })),
    sentAt: new Date(Date.parse(order.placedAt) - DAY).toISOString(),
    signedOn: signedAt.slice(0, 10),
    signedFileName: `${mockContractNumber(order)}-da-ky.pdf`,
    signedAt,
    returnWindowDays: 7,
    // The mock moves no delivery window after signing, so no signed mock contract has an appendix.
    appendixAvailable: false,
    version: 5,
  };
}

/**
 * Where the order's PDF lives: the signed file once signed, else the contract as sent; `?copy=sent`
 * asks for the PDF as sent even once signed (BE SalesContractService.customerDocument).
 */
const documentUrl = (contract: MockContract, copy?: string) =>
  contract.signedFileName && copy !== "sent"
    ? `https://files.example/contracts/${encodeURIComponent(contract.signedFileName)}`
    : `https://files.example/contracts/${contract.contractNumber}.pdf`;

export function createMockContractBook(
  customerId: string,
  orderOf: (orderId: string) => Readonly<MockOrder> | undefined,
  seed: MockContract[],
) {
  const contracts = seed.map((contract) => structuredClone(contract));
  const own = (orderId: string) => {
    const order = orderOf(orderId.toLowerCase());
    return order && order.customerId === customerId ? order : undefined;
  };
  /** The contract the customer may read: sent, signed or completed (BE sentContract). */
  const sent = (orderId: string) =>
    contracts.find(
      (c) =>
        c.orderId === orderId.toLowerCase() && c.status !== "DRAFT" && c.status !== "CANCELLED",
    );
  const refusal = (orderId: string) => {
    const order = own(orderId);
    if (!order) return fail(404, "NOT_FOUND", `Không tìm thấy đơn hàng ${orderId}.`);
    return fail(
      404,
      "SALES_CONTRACT_NOT_FOUND",
      `Đơn ${order.orderNumber} chưa có hợp đồng được gửi.`,
    );
  };

  return {
    /** GET /orders/me/{orderId}/contract */
    get(orderId: string): MockResult {
      const contract = own(orderId) ? sent(orderId) : undefined;
      return contract ? ok(contract) : refusal(orderId);
    },

    /** GET /orders/me/{orderId}/contract/document → DownloadLink. */
    document(orderId: string, copy?: string): MockResult {
      const contract = own(orderId) ? sent(orderId) : undefined;
      if (!contract) return refusal(orderId);
      return ok({
        url: documentUrl(contract, copy),
        expiresAt: new Date(Date.now() + 300_000).toISOString(),
      });
    },

    /**
     * GET /orders/me/{orderId}/delivery-batches: the schedule in force of an order with a contract
     * sent. The mock moves no window after signing (see `appendixAvailable`), so the window in force is
     * the contract's and no batch has a move.
     */
    schedule(orderId: string): MockResult {
      const contract = own(orderId) ? sent(orderId) : undefined;
      if (!contract) return refusal(orderId);
      return ok({
        orderId: contract.orderId,
        orderNumber: contract.orderNumber,
        contractNumber: contract.contractNumber,
        batches: contract.deliverySchedule.map((batch) => ({
          batchId: `${contract.orderId}-batch-${batch.seq}`,
          seq: batch.seq,
          ...(batch.windowStart ? { contractWindowStart: batch.windowStart } : {}),
          ...(batch.windowEnd ? { contractWindowEnd: batch.windowEnd } : {}),
          ...(batch.windowStart ? { windowStart: batch.windowStart } : {}),
          ...(batch.windowEnd ? { windowEnd: batch.windowEnd } : {}),
          windowChanges: [],
        })),
      });
    },

    /** The CONTRACT card payload (B.7.4); null when the order has no contract sent. */
    cardPayload(orderId: string): Record<string, unknown> | null {
      const contract = own(orderId) ? sent(orderId) : undefined;
      if (!contract) return null;
      return {
        id: contract.id,
        contractId: contract.id,
        number: contract.contractNumber,
        orderId: contract.orderId,
        orderNumber: contract.orderNumber,
        status: contract.status,
        totalAmount: contract.totals.totalAmount,
        currency: "VND",
        freeSampleRounds: contract.freeSampleRounds,
        paymentPlan: contract.paymentPlan,
        ...(contract.sentAt ? { sentAt: contract.sentAt } : {}),
        ...(contract.signedOn ? { signedOn: contract.signedOn } : {}),
        version: contract.version,
        documentPath: `/api/v1/orders/me/${contract.orderId}/contract/document`,
      };
    },
  };
}

export type MockContractBook = ReturnType<typeof createMockContractBook>;
