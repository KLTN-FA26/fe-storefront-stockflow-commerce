/**
 * Mock of the customer's returns (BE ReturnRequestController: /orders/{id}/returns, /returns/me,
 * /returns/me/{id}, /returns/{id}/evidence, /returns/{id}/cancellation, evidence download-url).
 * Same refusals as BE `ReturnRequest.open` for what the portal can send: order not delivered,
 * no delivery named on an order delivered in several (WF-05 TH-1), window closed (7 days from the
 * delivery), a line with an open return on the same delivery, more units than the delivery brought
 * minus what other returns hold, a printed line for a reason that names no fault, OTHER without a
 * text. A return whose goods are partly back is not withdrawn (RETURN_GOODS_PARTLY_RECEIVED).
 */

import {
  MOCK_RETURN_WINDOW_DAYS,
  endOfVnDays,
  mockShipmentReturnable,
  type MockOrder,
  type MockResult,
  type MockReturnClaim,
} from "./orders";

const ok = (data: unknown, status = 200): MockResult => ({
  status,
  data: { success: true, data, timestamp: new Date().toISOString() },
});
const fail = (status: number, errorCode: string, message: string): MockResult => ({
  status,
  data: { success: false, errorCode, message, timestamp: new Date().toISOString() },
});

type Status =
  | "REQUESTED"
  | "AWAITING_RETURN"
  | "RECEIVED"
  | "SETTLEMENT_PENDING"
  | "RESOLVED"
  | "REJECTED"
  | "CANCELLED"
  | "EXPIRED";

interface MockReturnLine {
  id: string;
  orderLineId: string;
  sku: string;
  customPrinted: boolean;
  unitPrice: number;
  requestedQuantity: number;
  approvedQuantity: number | null;
  receivedQuantity: number | null;
  refundQuantity: number;
}

export interface MockReturn {
  id: string;
  rmaNumber: string;
  requestId: string;
  orderId: string;
  orderNumber: string;
  /** The delivery the goods came on; null for an order that left as a whole. */
  shipmentId: string | null;
  customerId: string;
  status: Status;
  reasonCode: string;
  description: string | null;
  requestedAt: string;
  returnDeadline: string | null;
  rejectionReason: string | null;
  receivedAt: string | null;
  closedAt: string | null;
  lines: MockReturnLine[];
  evidence: { id: string; stage: "CLAIM"; originalName: string; uploadedAt: string }[];
  history: { status: Status; occurredAt: string }[];
  version: number;
}

const DAY = 86_400_000;
const WINDOW_DAYS = MOCK_RETURN_WINDOW_DAYS;
const DEADLINE_DAYS = 14;
const MAX_EVIDENCE = 10;
const OPEN: readonly Status[] = ["REQUESTED", "AWAITING_RETURN", "RECEIVED", "SETTLEMENT_PENDING"];
const NAMED_FAULT = ["PRINT_DEFECT", "DESIGN_MISMATCH", "DAMAGED_IN_TRANSIT", "WRONG_ITEM"];
const PORTAL_REASONS = [...NAMED_FAULT, "OTHER", "SHORT_DELIVERY", "CHANGED_MIND"];

const deliveredAt = (order: MockOrder) =>
  [...order.history].reverse().find((h) => h.status === "DELIVERED")?.occurredAt;

/** BE `ReturnLine.claimedUnits`. */
function claimed(line: MockReturnLine, status: Status): number {
  if (status === "REQUESTED") return line.requestedQuantity;
  if (status === "AWAITING_RETURN" || status === "RECEIVED" || status === "SETTLEMENT_PENDING")
    return line.approvedQuantity ?? 0;
  if (status === "RESOLVED") return line.refundQuantity;
  return 0;
}

const money = (line: MockReturnLine) => line.unitPrice * line.refundQuantity;

function toCustomer(r: MockReturn) {
  const refunded = r.status === "RESOLVED" ? r.lines.reduce((s, l) => s + money(l), 0) : null;
  return {
    id: r.id,
    rmaNumber: r.rmaNumber,
    orderId: r.orderId,
    orderNumber: r.orderNumber,
    ...(r.shipmentId ? { shipmentId: r.shipmentId } : {}),
    status: r.status,
    reasonCode: r.reasonCode,
    description: r.description,
    requestedResolution: "REFUND",
    requestedAt: r.requestedAt,
    returnRequired: r.status === "REQUESTED" ? null : true,
    returnDeadline: r.returnDeadline,
    rejectionReason: r.rejectionReason,
    receivedAt: r.receivedAt,
    closedAt: r.closedAt,
    currency: "VND",
    refundedAmount: refunded,
    offsetAmount: refunded === null ? null : 0,
    lines: r.lines.map((l) => ({
      id: l.id,
      orderLineId: l.orderLineId,
      sku: l.sku,
      requestedQuantity: l.requestedQuantity,
      approvedQuantity: l.approvedQuantity,
      receivedQuantity: l.receivedQuantity,
      refundQuantity: l.refundQuantity,
      refundAmount: l.refundQuantity > 0 ? money(l) : null,
    })),
    discrepancies: [],
    evidence: r.evidence.map((e) => ({ ...e, thumbnailUrl: null })),
    history: r.history,
    version: r.version,
  };
}

function toRow(r: MockReturn) {
  const c = toCustomer(r);
  return {
    id: r.id,
    rmaNumber: r.rmaNumber,
    orderId: r.orderId,
    orderNumber: r.orderNumber,
    ...(r.shipmentId ? { shipmentId: r.shipmentId } : {}),
    customerId: r.customerId,
    status: r.status,
    reasonCode: r.reasonCode,
    requestedResolution: "REFUND",
    channel: "PORTAL",
    requestedAt: r.requestedAt,
    returnDeadline: r.returnDeadline,
    settlementAmount: c.refundedAmount,
    refundedAmount: c.refundedAmount,
    offsetAmount: c.offsetAmount,
    currency: "VND",
    vatAdjustmentRequired: false,
    closedAt: r.closedAt,
    version: r.version,
  };
}

const toInt = (value: unknown, fallback: number) => {
  const n = typeof value === "string" ? Number(value) : typeof value === "number" ? value : NaN;
  return Number.isInteger(n) ? n : fallback;
};

const asList = (value: unknown): string[] =>
  Array.isArray(value) ? value.map(String) : typeof value === "string" ? [value] : [];

export function createMockReturnBook(
  customerId: string,
  orderOf: (orderId: string) => Readonly<MockOrder> | undefined,
  seed: MockReturn[] = [],
  now: () => Date = () => new Date(),
) {
  const returns = seed.map((r) => structuredClone(r));
  let sequence = 1;
  const nextId = (prefix: string) =>
    `${prefix}-0000-4000-8000-${(0xa000 + sequence++).toString(16).padStart(12, "0")}`;
  const own = (id: string) => returns.find((r) => r.id === id && r.customerId === customerId);
  const missing = () => fail(404, "RETURN_REQUEST_NOT_FOUND", "No return request");
  const move = (r: MockReturn, status: Status) => {
    r.status = status;
    r.version += 1;
    r.history.push({ status, occurredAt: now().toISOString() });
  };
  /** What the order's returns hold, line by line, for the order book's shipments. */
  const claimsOf = (orderId: string): MockReturnClaim[] =>
    returns
      .filter((r) => r.orderId === orderId)
      .flatMap((r) =>
        r.lines.map((l) => ({
          shipmentId: r.shipmentId,
          orderLineId: l.orderLineId,
          units: claimed(l, r.status),
          open: OPEN.includes(r.status),
        })),
      );

  return {
    claimsOf,

    /** GET /returns/me?status=&orderId=&page=&size= */
    mine(query: Record<string, unknown> = {}): MockResult {
      const page = toInt(query.page, 0);
      const size = toInt(query.size, 20);
      if (page < 0 || size < 1 || size > 200)
        return fail(400, "UNSUPPORTED_PARAMETER", "page/size out of range");
      const statuses = asList(query.status);
      const items = returns
        .filter((r) => r.customerId === customerId)
        .filter((r) => !query.orderId || r.orderId === query.orderId)
        .filter((r) => statuses.length === 0 || statuses.includes(r.status))
        .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
      const totalPages = Math.ceil(items.length / size);
      return ok({
        items: items.slice(page * size, (page + 1) * size).map(toRow),
        page,
        size,
        totalElements: items.length,
        totalPages,
        hasNext: page + 1 < totalPages,
        hasPrevious: page > 0,
      });
    },

    /** GET /returns/me/{id} */
    one(id: string): MockResult {
      const r = own(id);
      return r ? ok(toCustomer(r)) : missing();
    },

    /** POST /orders/{orderId}/returns */
    open(orderId: string, body: Record<string, unknown> = {}): MockResult {
      const order = orderOf(orderId);
      if (!order) return fail(404, "NOT_FOUND", `No order ${orderId}`);
      const requestId = String(body.requestId ?? "");
      const replay = returns.find((r) => r.requestId === requestId);
      if (replay) {
        return replay.orderId === orderId
          ? ok(toCustomer(replay), 201)
          : fail(422, "IDEMPOTENCY_KEY_REUSED", "requestId used on another order");
      }
      const reason = String(body.reasonCode ?? "");
      if (!PORTAL_REASONS.includes(reason))
        return fail(400, "VALIDATION_FAILED", "reasonCode is required");
      if (reason === "SHORT_DELIVERY")
        return fail(
          409,
          "RETURN_REASON_NOT_ACCEPTED",
          "A short delivery has no goods to send back",
        );
      if (order.status === "CANCELLED") return fail(409, "ORDER_CANCELLED", "Order cancelled");
      if (order.status !== "DELIVERED" && order.status !== "COMPLETED")
        return fail(409, "RETURN_ORDER_NOT_DELIVERED", "Order not delivered");
      // WF-05 TH-1: a return is against one delivered shipment, named when there were several.
      const arrived = (order.shipments ?? []).filter(
        (s) => s.status === "DELIVERED" && s.outcomeAt,
      );
      const named = typeof body.shipmentId === "string" ? body.shipmentId : undefined;
      if (!named && arrived.length > 1)
        return fail(422, "RETURN_SHIPMENT_REQUIRED", "Name the delivery the goods came on");
      const shipment = named ? arrived.find((s) => s.shipmentId === named) : arrived[0];
      if (named && !shipment)
        return fail(409, "RETURN_SHIPMENT_NOT_DELIVERED", "This shipment has not been delivered");
      const delivered = shipment?.outcomeAt ?? deliveredAt(order);
      if (
        order.status === "COMPLETED" ||
        (delivered && endOfVnDays(delivered, WINDOW_DAYS).getTime() <= now().getTime())
      )
        return fail(409, "RETURN_WINDOW_CLOSED", "The return window has closed");
      const shipmentId = shipment?.shipmentId ?? null;
      const description = typeof body.description === "string" ? body.description.trim() : "";
      if (reason === "OTHER" && !description)
        return fail(400, "VALIDATION_FAILED", "A return for OTHER must describe the problem");
      const claims = Array.isArray(body.lines) ? (body.lines as Record<string, unknown>[]) : [];
      if (claims.length === 0)
        return fail(409, "RETURN_QUANTITIES_INVALID", "A return claims at least one line");

      const others = returns.filter((r) => r.orderId === orderId);
      const holds = claimsOf(orderId);
      const lines: MockReturnLine[] = [];
      for (const claim of claims) {
        const line = order.lines.find((l) => l.lineId === claim.orderLineId);
        const quantity = toInt(claim.quantity, 0);
        if (!line || quantity < 1 || lines.some((l) => l.orderLineId === line.lineId))
          return fail(409, "RETURN_QUANTITIES_INVALID", "Invalid line or quantity");
        if (
          others.some(
            (r) =>
              r.shipmentId === shipmentId &&
              OPEN.includes(r.status) &&
              r.lines.some((l) => l.orderLineId === line.lineId),
          )
        )
          return fail(409, "RETURN_LINE_ALREADY_OPEN", `${line.sku} already has an open return`);
        const held = others.reduce(
          (sum, r) =>
            sum +
            r.lines
              .filter((l) => l.orderLineId === line.lineId)
              .reduce((s, l) => s + claimed(l, r.status), 0),
          0,
        );
        // Against a shipment: what it brought of the line, less its other returns (BE TH-1).
        const left = shipment
          ? mockShipmentReturnable(order, shipment, line.lineId, holds).max
          : line.quantity - held;
        if (quantity > left)
          return fail(409, "RETURN_QUANTITY_EXCEEDED", `${line.sku}: too many units`);
        const customPrinted = !!line.designSnapshotId;
        if (customPrinted && !NAMED_FAULT.includes(reason))
          return fail(
            409,
            "RETURN_CUSTOM_ITEM_NOT_DEFECTIVE",
            `${line.sku} was printed to a design`,
          );
        lines.push({
          id: nextId("7e7a1111"),
          orderLineId: line.lineId,
          sku: line.sku,
          customPrinted,
          unitPrice: line.unitPrice,
          requestedQuantity: quantity,
          approvedQuantity: null,
          receivedQuantity: null,
          refundQuantity: 0,
        });
      }
      if (reason === "CHANGED_MIND")
        return fail(409, "RETURN_REASON_NOT_ACCEPTED", "Not a change of mind");

      const at = now().toISOString();
      const created: MockReturn = {
        id: nextId("7e7a0000"),
        rmaNumber: `RMA-${at.slice(0, 10).replaceAll("-", "")}-${String(sequence).padStart(4, "0")}`,
        requestId,
        orderId,
        orderNumber: order.orderNumber,
        shipmentId,
        customerId,
        status: "REQUESTED",
        reasonCode: reason,
        description: description || null,
        requestedAt: at,
        returnDeadline: null,
        rejectionReason: null,
        receivedAt: null,
        closedAt: null,
        lines,
        evidence: [],
        history: [{ status: "REQUESTED", occurredAt: at }],
        version: 0,
      };
      returns.push(created);
      return ok(toCustomer(created), 201);
    },

    /** POST /returns/{id}/evidence (multipart; the mock does not read the file). */
    addEvidence(id: string, name = "photo.jpg"): MockResult {
      const r = own(id);
      if (!r) return missing();
      if (r.status !== "REQUESTED")
        return fail(409, "RETURN_INVALID_TRANSITION", "Photos only while REQUESTED");
      if (r.evidence.length >= MAX_EVIDENCE)
        return fail(409, "RETURN_EVIDENCE_LIMIT_REACHED", "Too many photos");
      r.evidence.push({
        id: nextId("e71d0000"),
        stage: "CLAIM",
        originalName: name,
        uploadedAt: now().toISOString(),
      });
      r.version += 1;
      return ok(toCustomer(r), 201);
    },

    /** GET /returns/{id}/evidence/{evidenceId}/download-url */
    evidenceLink(id: string, evidenceId: string): MockResult {
      const r = own(id);
      if (!r || !r.evidence.some((e) => e.id === evidenceId)) return missing();
      return ok({ url: "/stockflowcommerce-icon.svg" });
    },

    /** POST /returns/{id}/cancellation */
    cancel(id: string): MockResult {
      const r = own(id);
      if (!r) return missing();
      if (r.status !== "REQUESTED" && r.status !== "AWAITING_RETURN")
        return fail(409, "RETURN_INVALID_TRANSITION", "Goods are back already");
      // WF-05 TH-3: a parcel already in the warehouse keeps the return (Sales mark the goods complete).
      if (r.receivedAt || r.lines.some((l) => (l.receivedQuantity ?? 0) > 0))
        return fail(
          409,
          "RETURN_GOODS_PARTLY_RECEIVED",
          "Some goods of this return are already back",
        );
      move(r, "CANCELLED");
      r.closedAt = now().toISOString();
      return ok(toCustomer(r));
    },

    /** Test hook: one parcel of an approved return reached the warehouse; it stays AWAITING_RETURN. */
    receiveParcel(id: string, units = 1) {
      const r = own(id);
      const line = r?.lines[0];
      if (!r || !line || r.status !== "AWAITING_RETURN") return;
      line.receivedQuantity = (line.receivedQuantity ?? 0) + units;
      r.receivedAt = now().toISOString();
      r.version += 1;
    },

    /** Test hook: Sales approve in full (REQUESTED → AWAITING_RETURN). */
    approve(id: string) {
      const r = own(id);
      if (!r || r.status !== "REQUESTED") return;
      for (const line of r.lines) line.approvedQuantity = line.requestedQuantity;
      r.returnDeadline = endOfVnDays(now().toISOString(), DEADLINE_DAYS).toISOString();
      move(r, "AWAITING_RETURN");
    },
  };
}

export type MockReturnBook = ReturnType<typeof createMockReturnBook>;

/**
 * Two returns of the seeded orders so the screens have something to show: one waiting for its
 * goods on the DELIVERED order, one refunded on the RETURNED order. Seeded dates are in the past,
 * so the window of every seeded order is closed and new returns are refused (as the BE would).
 */
export function seedMockReturns(
  customerId: string,
  orderOf: (orderId: string) => Readonly<MockOrder> | undefined,
  orderIds: { awaiting: string; resolved: string },
): MockReturn[] {
  const make = (
    orderId: string,
    n: number,
    status: Status,
    reasonCode: string,
  ): MockReturn | undefined => {
    const order = orderOf(orderId);
    const line = order?.lines[0];
    const delivered = order && deliveredAt(order);
    if (!order || !line || !delivered) return undefined;
    const at = (days: number) => new Date(Date.parse(delivered) + days * DAY).toISOString();
    const resolved = status === "RESOLVED";
    const shipment = order.shipments?.find((s) => s.lines.some((l) => l.lineId === line.lineId));
    return {
      id: `7e7a0000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`,
      rmaNumber: `RMA-${delivered.slice(0, 10).replaceAll("-", "")}-${String(n).padStart(4, "0")}`,
      requestId: `7e7a9999-0000-4000-8000-${n.toString(16).padStart(12, "0")}`,
      orderId,
      orderNumber: order.orderNumber,
      shipmentId: shipment?.shipmentId ?? null,
      customerId,
      status,
      reasonCode,
      description: resolved ? "Bản in bị lem ở mặt sau." : "Thùng bị móp, 1 cái vỡ.",
      requestedAt: at(1),
      returnDeadline: at(16),
      rejectionReason: null,
      receivedAt: resolved ? at(4) : null,
      closedAt: resolved ? at(6) : null,
      lines: [
        {
          id: `7e7a1111-0000-4000-8000-${n.toString(16).padStart(12, "0")}`,
          orderLineId: line.lineId,
          sku: line.sku,
          customPrinted: !!line.designSnapshotId,
          unitPrice: line.unitPrice,
          requestedQuantity: 1,
          approvedQuantity: 1,
          receivedQuantity: resolved ? 1 : null,
          refundQuantity: resolved ? 1 : 0,
        },
      ],
      evidence: [
        {
          id: `e71d0000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`,
          stage: "CLAIM",
          originalName: "anh-loi.jpg",
          uploadedAt: at(1),
        },
      ],
      history: resolved
        ? (
            ["REQUESTED", "AWAITING_RETURN", "RECEIVED", "SETTLEMENT_PENDING", "RESOLVED"] as const
          ).map((s, i) => ({ status: s, occurredAt: at(1 + i) }))
        : [
            { status: "REQUESTED", occurredAt: at(1) },
            { status: "AWAITING_RETURN", occurredAt: at(2) },
          ],
      version: resolved ? 4 : 1,
    };
  };
  return [
    make(orderIds.awaiting, 1, "AWAITING_RETURN", "DAMAGED_IN_TRANSIT"),
    make(orderIds.resolved, 2, "RESOLVED", "PRINT_DEFECT"),
  ].filter((r): r is MockReturn => r !== undefined);
}
