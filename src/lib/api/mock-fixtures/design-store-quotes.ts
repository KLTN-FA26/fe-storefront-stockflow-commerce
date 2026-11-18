/**
 * Quote requests on designs and projects, the BE's way (plan WF-02 Phụ lục B area A; BE
 * `QuoteRequestRules`, `DesignQuoteRequestService`, `DesignProjectQuoteRequestService`):
 *  - `cartons` 1 to 1,000,000 (400 `VALIDATION_FAILED` on `cartons`, `quoteRequest.cartons` in a
 *    submission, `lines[i].cartons` in a project request); a desired date, if any, not before today
 *    in Vietnam (`FutureOrPresent`, on `desiredDeliveryDate` / `quoteRequest.desiredDeliveryDate`);
 *  - asked on its own, the design must be APPROVED (409 `DESIGN_NOT_APPROVED`); a draft asks with its
 *    submission (`askOnSubmit`); a project asks over APPROVED designs of its own only, and not once
 *    it is closed (409 `DESIGN_PROJECT_ARCHIVED`);
 *  - one OPEN request per design and per project: asking again changes it and answers 200 (a
 *    project's identical ask changes nothing and tells nobody), a new one answers 201;
 *  - a returned design keeps its open request (it follows the design, B40); a deleted draft closes
 *    it (`closeOpenQuote`, no `closedBy`); a closed project keeps its own open;
 *  - a request shows the design as it is now: its status, `customerSku` only once APPROVED, the
 *    return reason while it is a draft again.
 * After every ask that changed something the chat mock is told (`emitMockChatEvent`), with the card
 * payload of plan §B.7.1 / §B.7.2, as the BE posts its card after commit.
 */

import { vnDateOf } from "@/features/product-design/quote-request-rules";

import {
  asRecord,
  fail,
  notFound,
  ok,
  projectNotFound,
  stableGuid,
  type DesignRow,
  type FieldError,
  type MockResult,
  type ProjectQuoteRequestRow,
  type ProjectRow,
  type QuoteRequestRow,
} from "./design-rows";
import type { StoreContext } from "./design-store-context";
import { emitMockChatEvent, type MockChatEvent } from "./wf02";

/** BE `QuoteRequestRules.MAX_CARTONS`. */
const MAX_CARTONS = 1_000_000;
/** BE `ProjectQuoteRequest.lines`: `@Size(min = 1, max = 20)`. */
const MAX_LINES = 20;

/** The one mock customer, as a request names it (mock only). */
const MOCK_CUSTOMER = {
  id: stableGuid("customer:USER-CUS-0010"),
  name: "Khách hàng mẫu",
  userId: stableGuid("user:USER-CUS-0010"),
};

/** What a customer asks: the cartons and, if any, the date (`yyyy-MM-dd`). */
export type Ask = { cartons: number; desiredDeliveryDate: string | null };

const invalidFields = (fieldErrors: FieldError[], message = "Dữ liệu không hợp lệ.") =>
  fail(400, "VALIDATION_FAILED", message, { fieldErrors });
const malformed = () => fail(400, "MALFORMED_REQUEST", "Không đọc được nội dung yêu cầu.");

const CARTONS_RANGE = "Số thùng từ 1 đến 1.000.000.";
const DATE_PAST = "Ngày giao mong muốn phải từ hôm nay trở đi.";

/** Bean validation of `@Min(1) @Max(1000000) int cartons`: a missing number is 0. */
function cartonsError(value: unknown, field: string): FieldError | "malformed" | null {
  const cartons = value === undefined || value === null ? 0 : value;
  if (typeof cartons !== "number" || !Number.isInteger(cartons)) return "malformed";
  if (cartons < 1) return { field, message: CARTONS_RANGE, code: "Min" };
  if (cartons > MAX_CARTONS) return { field, message: CARTONS_RANGE, code: "Max" };
  return null;
}

const isLocalDate = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));

/** A `LocalDate` or none; an unreadable one is a 400 `MALFORMED_REQUEST`, as Jackson's. */
function readDate(value: unknown): string | null | "malformed" {
  if (value === undefined || value === null) return null;
  return typeof value === "string" && isLocalDate(value) ? value : "malformed";
}

/**
 * A request's body (`{cartons, desiredDeliveryDate?}`) checked as the BE does, its fields named
 * under `prefix` (`quoteRequest.` in a submission).
 */
export function readAsk(
  body: unknown,
  today: string,
  prefix = "",
): { ask: Ask } | { refused: MockResult } {
  const { cartons, desiredDeliveryDate } = asRecord(body);
  const date = readDate(desiredDeliveryDate);
  const wrong = cartonsError(cartons, `${prefix}cartons`);
  if (wrong === "malformed" || date === "malformed") return { refused: malformed() };
  if (wrong) return { refused: invalidFields([wrong]) };
  if (date !== null && date < today) {
    const field = `${prefix}desiredDeliveryDate`;
    return {
      refused: invalidFields([{ field, message: DATE_PAST, code: "FutureOrPresent" }], DATE_PAST),
    };
  }
  return { ask: { cartons: cartons as number, desiredDeliveryDate: date } };
}

/** The design's open request, if any. */
const openOf = (ctx: StoreContext, designId: string) =>
  ctx.state().quoteRequests.find((r) => r.designId === designId && r.status === "OPEN");

/** A design whatever its status: a request outlives its deleted draft. */
const designOf = (ctx: StoreContext, id: string) => ctx.state().designs.find((d) => d.id === id);

const customerSkuOf = (design: DesignRow | undefined) =>
  design?.status === "APPROVED" ? (design.approval?.skuCode ?? null) : null;

/** `DesignQuoteRequestResponse` (nulls are dropped on the way out, as the BE's `non_null`). */
function designView(ctx: StoreContext, row: QuoteRequestRow) {
  const design = designOf(ctx, row.designId);
  return {
    id: row.id,
    designId: row.designId,
    designName: design?.name ?? "",
    designStatus: design?.status ?? "ARCHIVED",
    customerId: MOCK_CUSTOMER.id,
    customerName: MOCK_CUSTOMER.name,
    sku: design?.variant.sku ?? null,
    customerSku: customerSkuOf(design),
    returnReason: design?.status === "DRAFT" ? (design.lastReturn?.reason ?? null) : null,
    cartons: row.cartons,
    desiredDeliveryDate: row.desiredDeliveryDate,
    status: row.status,
    requestedBy: MOCK_CUSTOMER.userId,
    requestedAt: row.requestedAt,
    closedAt: row.closedAt,
    closedBy: row.closedBy,
  };
}

/** `DesignProjectQuoteRequestResponse`: the lines sorted by design id, as the BE answers them. */
function projectView(ctx: StoreContext, row: ProjectQuoteRequestRow, project: ProjectRow) {
  return {
    id: row.id,
    projectId: row.projectId,
    projectName: project.name,
    customerId: MOCK_CUSTOMER.id,
    customerName: MOCK_CUSTOMER.name,
    desiredDeliveryDate: row.desiredDeliveryDate,
    requestedBy: MOCK_CUSTOMER.userId,
    requestedAt: row.requestedAt,
    status: row.status,
    closedAt: row.closedAt,
    closedBy: row.closedBy,
    lines: row.lines
      .toSorted((a, b) => a.designId.localeCompare(b.designId))
      .map((line) => {
        const design = designOf(ctx, line.designId);
        return {
          designId: line.designId,
          designName: design?.name ?? "",
          designStatus: design?.status ?? "ARCHIVED",
          customerSku: customerSkuOf(design),
          cartons: line.cartons,
        };
      }),
  };
}

/** Tells the chat mock; a listener that throws must not undo an ask that is saved. */
function tellChat(event: MockChatEvent) {
  try {
    emitMockChatEvent(event);
  } catch (error) {
    console.error("[mock-design] The chat mock failed on a quote request event.", error);
  }
}

/** The design-scope card (plan §B.7.1): every key present, `null` when there is nothing. */
function tellDesignAsked(ctx: StoreContext, row: QuoteRequestRow, created: boolean) {
  const view = designView(ctx, row);
  tellChat({
    type: "DESIGN_QUOTE_REQUESTED",
    created,
    payload: {
      scope: "DESIGN",
      requestId: view.id,
      designId: view.designId,
      designName: view.designName,
      designStatus: view.designStatus,
      sku: view.sku,
      customerSku: view.customerSku,
      returnReason: view.returnReason,
      cartons: view.cartons,
      desiredDeliveryDate: view.desiredDeliveryDate,
      requestStatus: view.status,
      requestedAt: view.requestedAt,
    },
  });
}

/** The project-scope card (plan §B.7.2): `status`, not `requestStatus`; a line's null SKU is left out. */
function tellProjectAsked(
  ctx: StoreContext,
  row: ProjectQuoteRequestRow,
  project: ProjectRow,
  created: boolean,
) {
  const view = projectView(ctx, row, project);
  tellChat({
    type: "PROJECT_QUOTE_REQUESTED",
    created,
    payload: {
      scope: "PROJECT",
      requestId: view.id,
      projectId: view.projectId,
      projectName: view.projectName,
      status: view.status,
      desiredDeliveryDate: view.desiredDeliveryDate,
      requestedAt: view.requestedAt,
      lines: view.lines.map(({ customerSku, ...line }) =>
        customerSku ? { ...line, customerSku } : line,
      ),
    },
  });
}

const askNote = (ask: Ask) =>
  `${ask.cartons} carton(s)${ask.desiredDeliveryDate ? `, delivery by ${ask.desiredDeliveryDate}` : ""}`;

/**
 * Opens a request on `design`, or changes the one still open (B40: it follows a returned design),
 * and writes `QUOTE_REQUESTED` on its history. The caller saves, then `tellDesignAsked`.
 */
function ask(ctx: StoreContext, design: DesignRow, asked: Ask) {
  const open = openOf(ctx, design.id);
  if (open) {
    open.cartons = asked.cartons;
    open.desiredDeliveryDate = asked.desiredDeliveryDate;
    ctx.record(design, "QUOTE_REQUESTED", `Asked again: ${askNote(asked)}`, design.version);
    return { request: open, created: false };
  }
  const request: QuoteRequestRow = {
    id: ctx.newId(),
    designId: design.id,
    cartons: asked.cartons,
    desiredDeliveryDate: asked.desiredDeliveryDate,
    status: "OPEN",
    requestedAt: ctx.stamp(),
    closedAt: null,
    closedBy: null,
  };
  ctx.state().quoteRequests.push(request);
  ctx.record(design, "QUOTE_REQUESTED", askNote(asked), design.version);
  return { request, created: true };
}

/**
 * The request a submission carries (A-2), asked once the design is PENDING_REVIEW; saved by the
 * submission. Answers what to tell the chat once it is saved.
 */
export function askOnSubmit(ctx: StoreContext, design: DesignRow, asked: Ask): () => void {
  const { request, created } = ask(ctx, design, asked);
  return () => tellDesignAsked(ctx, request, created);
}

/** A deleted draft's open request closes, by nobody (`DesignQuoteRequestService.closeOpen`). */
export function closeOpenQuote(ctx: StoreContext, designId: string): void {
  const open = openOf(ctx, designId);
  if (!open) return;
  open.status = "CLOSED";
  open.closedAt = ctx.stamp();
  open.closedBy = null;
}

const notApproved = (design: DesignRow) =>
  fail(
    409,
    "DESIGN_NOT_APPROVED",
    `Thiết kế đang ở trạng thái ${design.status}: chỉ yêu cầu báo giá cho thiết kế đã duyệt, hoặc chọn "Gửi duyệt và yêu cầu báo giá".`,
  );

type LineAsk = { designId: string; cartons: number };

/** The bean validation of a project request's `lines`, then each design named once. */
function readLines(value: unknown): { lines: LineAsk[] } | { refused: MockResult } {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_LINES) {
    return {
      refused: invalidFields([
        { field: "lines", message: "Chọn từ 1 đến 20 thiết kế.", code: "Size" },
      ]),
    };
  }
  const errors: FieldError[] = [];
  const lines: LineAsk[] = [];
  for (const [index, raw] of value.entries()) {
    const { designId, cartons } = asRecord(raw);
    const wrong = cartonsError(cartons, `lines[${index}].cartons`);
    if (wrong === "malformed") return { refused: malformed() };
    if (wrong) errors.push(wrong);
    if (typeof designId !== "string" || !designId) {
      errors.push({
        field: `lines[${index}].designId`,
        message: "Chưa chọn thiết kế.",
        code: "NotNull",
      });
    }
    lines.push({ designId: String(designId), cartons: Number(cartons) });
  }
  if (errors.length) return { refused: invalidFields(errors) };
  if (new Set(lines.map((line) => line.designId)).size !== lines.length) {
    return {
      refused: fail(400, "VALIDATION_FAILED", "Mỗi thiết kế chỉ chọn một lần trong yêu cầu."),
    };
  }
  return { lines };
}

const sameAsk = (open: ProjectQuoteRequestRow, lines: LineAsk[], date: string | null) =>
  open.desiredDeliveryDate === date &&
  open.lines.length === lines.length &&
  lines.every((line) =>
    open.lines.some((had) => had.designId === line.designId && had.cartons === line.cartons),
  );

export function createQuoteOps(ctx: StoreContext) {
  const today = () => vnDateOf(ctx.now());

  return {
    /** POST /designs/{id}/quote-requests (A-1): 201 a new request, 200 the open one changed. */
    async requestDesign(id: string, body: unknown): Promise<MockResult> {
      const read = readAsk(body, today());
      if ("refused" in read) return read.refused;
      const design = ctx.find(id);
      if (!design) return notFound();
      if (design.status !== "APPROVED") return notApproved(design);
      const { request, created } = ask(ctx, design, read.ask);
      await ctx.persist();
      tellDesignAsked(ctx, request, created);
      return ok(designView(ctx, request), created ? 201 : 200);
    },

    /** GET /designs/{id}/quote-requests (A-3): newest first; a deleted design is not found. */
    async listDesign(id: string): Promise<MockResult> {
      if (!ctx.find(id)) return notFound();
      const rows = ctx.state().quoteRequests.filter((r) => r.designId === id);
      return ok(rows.toReversed().map((row) => designView(ctx, row)));
    },

    /** POST /design-projects/{id}/quote-requests (A-6). */
    async requestProject(id: string, body: unknown): Promise<MockResult> {
      const { lines: rawLines, desiredDeliveryDate } = asRecord(body);
      const read = readLines(rawLines);
      if ("refused" in read) return read.refused;
      const date = readDate(desiredDeliveryDate);
      if (date === "malformed") return malformed();
      if (date !== null && date < today()) {
        return invalidFields(
          [{ field: "desiredDeliveryDate", message: DATE_PAST, code: "FutureOrPresent" }],
          DATE_PAST,
        );
      }
      const project = ctx.findProject(id);
      if (!project) return projectNotFound();
      if (project.status !== "ACTIVE") {
        return fail(409, "DESIGN_PROJECT_ARCHIVED", "Dự án thiết kế đã đóng");
      }
      const designs: DesignRow[] = [];
      for (const line of read.lines) {
        const design = ctx.find(line.designId);
        if (!design || design.projectId !== id) return notFound();
        if (design.status !== "APPROVED") return notApproved(design);
        designs.push(design);
      }

      const state = ctx.state();
      const open = state.projectQuoteRequests.find(
        (r) => r.projectId === id && r.status === "OPEN",
      );
      // A second click on the same ask: the request as it is, told to nobody again.
      if (open && sameAsk(open, read.lines, date)) return ok(projectView(ctx, open, project), 200);
      const request: ProjectQuoteRequestRow = open ?? {
        id: ctx.newId(),
        projectId: id,
        desiredDeliveryDate: date,
        status: "OPEN",
        requestedAt: ctx.stamp(),
        closedAt: null,
        closedBy: null,
        lines: [],
      };
      request.lines = read.lines;
      request.desiredDeliveryDate = date;
      if (!open) state.projectQuoteRequests.push(request);
      for (const [index, design] of designs.entries()) {
        const asked = { cartons: read.lines[index]!.cartons, desiredDeliveryDate: date };
        ctx.record(
          design,
          "QUOTE_REQUESTED",
          `${askNote(asked)}, project request ${request.id}`,
          design.version,
        );
      }
      const note = read.lines.map((line) => `${line.designId} x${line.cartons}`).join(", ");
      ctx.recordProject(
        project,
        "PROJECT_QUOTE_REQUESTED",
        `Request ${request.id}${open ? " asked again" : ""}: ${note}`,
      );
      await ctx.persist();
      tellProjectAsked(ctx, request, project, !open);
      return ok(projectView(ctx, request, project), open ? 200 : 201);
    },

    /** GET /design-projects/{id}/quote-requests (A-7): newest first, a closed project's too. */
    async listProject(id: string): Promise<MockResult> {
      const project = ctx.findProject(id);
      if (!project) return projectNotFound();
      const rows = ctx.state().projectQuoteRequests.filter((r) => r.projectId === id);
      return ok(rows.toReversed().map((row) => projectView(ctx, row, project)));
    },
  };
}
