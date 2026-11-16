/**
 * The installment plan of a mock order, shaped like BE payment InstallmentResponse /
 * OrderInstallmentsResponse (kltn-docs 15 §4.1, §5.1). The mock orders still carry the term they
 * were seeded with (PREPAID / DEPOSIT / CREDIT); the plan a signed contract would have for that term
 * is derived from it, and the money that arrived is laid on the installments in order.
 */
import type { MockOrder, MockOrderStatus } from "./orders";

const DAY_MS = 86_400_000;
/** Days an ON_SIGNING installment is given after signing (15 §4.1: "ngày ký + N ngày"). */
const ON_SIGNING_DAYS = 7;

/** No contract was signed: no installments, and the BE answers 404 INSTALLMENT_NOT_FOUND. */
const UNSIGNED = new Set<MockOrderStatus>(["DRAFT"]);
/** The order is ready to leave: BEFORE_DELIVERY falls due (15 §4.1). */
const READY_OR_LATER = new Set<MockOrderStatus>([
  "READY_TO_FULFILL",
  "IN_FULFILMENT",
  "SHIPPED",
  "DELIVERED",
  "COMPLETED",
]);
/** Delivered: AFTER_DELIVERY falls due. */
const DELIVERED = new Set<MockOrderStatus>(["DELIVERED", "COMPLETED"]);

interface PlanPart {
  name: string;
  milestone: "ON_SIGNING" | "BEFORE_DELIVERY" | "AFTER_DELIVERY";
  amount: number;
}

function partsOf(order: MockOrder): PlanPart[] {
  const total = order.totalAmount;
  if (order.paymentTerm === "CREDIT") {
    return [{ name: "Thanh toán sau giao", milestone: "AFTER_DELIVERY", amount: total }];
  }
  if (order.paymentTerm === "DEPOSIT") {
    const deposit = order.depositRequired ?? Math.round(total * 0.3);
    return [
      { name: "Đặt cọc", milestone: "ON_SIGNING", amount: deposit },
      { name: "Thanh toán trước giao", milestone: "BEFORE_DELIVERY", amount: total - deposit },
    ];
  }
  return [{ name: "Thanh toán toàn bộ", milestone: "ON_SIGNING", amount: total }];
}

/** When the order first reached one of the statuses, from its history. */
const reachedAt = (order: MockOrder, statuses: ReadonlySet<MockOrderStatus>) =>
  order.history.find((entry) => statuses.has(entry.status))?.occurredAt;

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** The installment's id: the order's id with its first group swapped, unique per order and seq. */
export const mockInstallmentId = (orderId: string, seq: number) =>
  `1a5e00${String(seq).padStart(2, "0")}${orderId.slice(8)}`;

export const mockContractNumber = (order: MockOrder) =>
  `HD-${order.orderNumber.replace(/^SO-/, "")}-1`;

/** InstallmentResponse of every installment of the order, or undefined when it has none. */
export function mockInstallmentsOf(order: MockOrder, today = new Date()) {
  if (UNSIGNED.has(order.status)) return undefined;
  if (order.status === "CANCELLED" && order.paidAmount <= 0) return undefined;
  const contractNumber = mockContractNumber(order);
  const deliveredAt = reachedAt(order, DELIVERED);
  const readyAt = reachedAt(order, READY_OR_LATER);
  let unallocated = order.paidAmount;

  return partsOf(order).map((part, index) => {
    const seq = index + 1;
    const paidAmount = Math.min(unallocated, part.amount);
    unallocated -= paidAmount;
    const outstanding = part.amount - paidAmount;
    const reached =
      part.milestone === "ON_SIGNING"
        ? order.placedAt
        : part.milestone === "BEFORE_DELIVERY"
          ? readyAt
          : deliveredAt;
    const dueDays = part.milestone === "AFTER_DELIVERY" ? (order.creditTermDays ?? 30) : undefined;
    const dueMs =
      part.milestone === "ON_SIGNING"
        ? Date.parse(order.placedAt) + ON_SIGNING_DAYS * DAY_MS
        : part.milestone === "AFTER_DELIVERY" && reached
          ? Date.parse(reached) + (dueDays ?? 0) * DAY_MS
          : undefined;
    const status =
      outstanding === 0
        ? "PAID"
        : order.status === "CANCELLED"
          ? "CANCELLED"
          : paidAmount > 0
            ? "PARTIALLY_PAID"
            : reached
              ? "DUE"
              : "NOT_DUE";
    const overdue =
      (status === "DUE" || status === "PARTIALLY_PAID") &&
      dueMs !== undefined &&
      isoDay(dueMs) < isoDay(today.getTime());
    return {
      installmentId: mockInstallmentId(order.orderId, seq),
      contractId: mockInstallmentId(order.orderId, 0),
      contractNumber,
      orderId: order.orderId,
      orderNumber: order.orderNumber,
      customerId: order.customerId,
      seq,
      name: part.name,
      milestone: part.milestone,
      amount: part.amount,
      paidAmount,
      reducedAmount: 0,
      outstanding: status === "CANCELLED" ? 0 : outstanding,
      currency: order.currency,
      ...(dueDays !== undefined ? { dueDays } : {}),
      ...(reached ? { reachedAt: reached } : {}),
      ...(dueMs !== undefined && reached ? { dueDate: isoDay(dueMs) } : {}),
      status,
      overdue,
      ...(status === "PAID" ? { paidAt: order.lastModifiedAt } : {}),
      ...(status === "CANCELLED" ? { cancelledAt: order.lastModifiedAt } : {}),
      transferReference: `${contractNumber} DOT${seq}`,
    };
  });
}

/** OrderInstallmentsResponse, or undefined when the order has no installments. */
export function mockOrderInstallments(order: MockOrder, today = new Date()) {
  const installments = mockInstallmentsOf(order, today);
  if (!installments) return undefined;
  const live = installments.filter((i) => i.status !== "CANCELLED");
  const total = live.reduce((sum, i) => sum + i.amount, 0);
  const paid = live.reduce((sum, i) => sum + i.paidAmount, 0);
  const outstanding = live.reduce((sum, i) => sum + i.outstanding, 0);
  const owedBefore = (milestone: string) =>
    live.filter((i) => i.milestone === milestone).reduce((sum, i) => sum + i.outstanding, 0);
  return {
    orderId: order.orderId,
    orderNumber: order.orderNumber,
    contractNumber: mockContractNumber(order),
    ...(live.length > 0
      ? { paymentStatus: paid === 0 ? "UNPAID" : outstanding === 0 ? "PAID" : "PARTIALLY_PAID" }
      : {}),
    total,
    paid,
    outstanding,
    onSigningPaid: owedBefore("ON_SIGNING") === 0,
    beforeDeliveryUnpaid: owedBefore("BEFORE_DELIVERY"),
    dueBeforeHandover: owedBefore("ON_SIGNING") + owedBefore("BEFORE_DELIVERY"),
    currency: order.currency,
    installments,
  };
}

/** The shop's account the mock shows (BE CompanyBankProperties). */
export const MOCK_COMPANY_BANK = {
  bankName: "Vietcombank",
  accountNumber: "0071000888999",
  accountName: "CONG TY TNHH STOCKFLOW",
};
