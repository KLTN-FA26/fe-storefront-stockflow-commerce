import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/error";

import { projectQuoteFieldErrorsOf, quoteFieldErrorsOf } from "../quote-request-errors";
import { mayHaveQuoteRequest, vnDateOf, vnToday } from "../quote-request-rules";
import {
  designQuoteRequestDtoSchema,
  projectQuoteFormSchema,
  projectQuoteRequestInputSchema,
  quoteRequestFormSchema,
  quoteRequestInputSchema,
} from "../quote-request-schemas";

// The rules of a quote request (BE `QuoteRequestRules`): 1 to 1,000,000 cartons, a desired date not
// before today in Vietnam (today allowed), 1 to 20 designs named once in a project request.

const D1 = "7d51f000-0000-4000-8000-000000000001";
const D2 = "7d51f000-0000-4000-8000-000000000002";

// 18:30 UTC on 18 Nov is 01:30 on 19 Nov in Vietnam.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-18T18:30:00Z"));
});
afterEach(() => vi.useRealTimers());

const messages = (result: { success: boolean; error?: { issues: { message: string }[] } }) =>
  result.success ? [] : (result.error?.issues.map((issue) => issue.message) ?? []);

describe("today in Vietnam", () => {
  it("is the calendar day in Asia/Ho_Chi_Minh, not in UTC", () => {
    expect(vnToday()).toBe("2026-11-19");
    expect(vnDateOf(new Date("2026-11-18T16:59:59Z"))).toBe("2026-11-18");
    expect(vnDateOf(new Date("2026-11-18T17:00:00Z"))).toBe("2026-11-19");
  });
});

describe("quoteRequestInputSchema", () => {
  it.each([1, 120, 1_000_000])("takes %d cartons", (cartons) => {
    expect(quoteRequestInputSchema.safeParse({ cartons }).success).toBe(true);
  });

  it.each([0, -1, 1_000_001, 1.5])("refuses %d cartons", (cartons) => {
    expect(quoteRequestInputSchema.safeParse({ cartons }).success).toBe(false);
  });

  it("takes today in Vietnam and later, refuses the day before (today in UTC)", () => {
    const at = (desiredDeliveryDate: string) =>
      quoteRequestInputSchema.safeParse({ cartons: 1, desiredDeliveryDate });
    expect(at("2026-11-19").success).toBe(true);
    expect(at("2027-01-01").success).toBe(true);
    expect(messages(at("2026-11-18"))).toEqual(["Ngày giao mong muốn phải từ hôm nay trở đi."]);
    expect(at("19/11/2026").success).toBe(false);
  });
});

describe("quoteRequestFormSchema", () => {
  it("turns the typed text into the request: a blank date is no date", () => {
    expect(quoteRequestFormSchema.parse({ cartons: " 120 ", desiredDeliveryDate: "" })).toEqual({
      cartons: 120,
      desiredDeliveryDate: undefined,
    });
    expect(
      quoteRequestFormSchema.parse({ cartons: "5", desiredDeliveryDate: "2026-12-20" }),
    ).toEqual({ cartons: 5, desiredDeliveryDate: "2026-12-20" });
  });

  it("words what is wrong with the cartons", () => {
    const of = (cartons: string) =>
      messages(quoteRequestFormSchema.safeParse({ cartons, desiredDeliveryDate: "" }));
    expect(of("")).toEqual(["Nhập số thùng mong muốn."]);
    expect(of("1,5")).toEqual(["Số thùng là số nguyên dương."]);
    expect(of("0")).toEqual(["Số thùng từ 1 đến 1.000.000."]);
    expect(of("1000001")).toEqual(["Số thùng từ 1 đến 1.000.000."]);
  });
});

describe("project requests", () => {
  it("names 1 to 20 designs, each once", () => {
    const lines = (n: number) =>
      Array.from({ length: n }, (_, i) => ({
        designId: `7d51f000-0000-4000-8000-${String(i).padStart(12, "0")}`,
        cartons: 1,
      }));
    expect(projectQuoteRequestInputSchema.safeParse({ lines: lines(1) }).success).toBe(true);
    expect(projectQuoteRequestInputSchema.safeParse({ lines: lines(20) }).success).toBe(true);
    expect(projectQuoteRequestInputSchema.safeParse({ lines: [] }).success).toBe(false);
    expect(projectQuoteRequestInputSchema.safeParse({ lines: lines(21) }).success).toBe(false);
    const twice = [
      { designId: D1, cartons: 1 },
      { designId: D1, cartons: 2 },
    ];
    expect(messages(projectQuoteRequestInputSchema.safeParse({ lines: twice }))).toEqual([
      "Mỗi thiết kế chỉ chọn một lần trong yêu cầu.",
    ]);
  });

  it("the form sends the chosen rows only, checks their cartons on their row, and one shared date", () => {
    const form = {
      lines: [
        { designId: D1, chosen: true, cartons: "40" },
        { designId: D2, chosen: false, cartons: "" },
      ],
      desiredDeliveryDate: "2026-12-20",
    };
    expect(projectQuoteFormSchema.parse(form)).toEqual({
      lines: [{ designId: D1, cartons: 40 }],
      desiredDeliveryDate: "2026-12-20",
    });

    const wrong = projectQuoteFormSchema.safeParse({
      lines: [
        { designId: D1, chosen: false, cartons: "" },
        { designId: D2, chosen: true, cartons: "0" },
      ],
      desiredDeliveryDate: "2026-11-18",
    });
    expect(wrong.success).toBe(false);
    expect(wrong.error?.issues.map((issue) => [issue.path.join("."), issue.message])).toEqual([
      ["lines.1.cartons", "Số thùng từ 1 đến 1.000.000."],
      ["desiredDeliveryDate", "Ngày giao mong muốn phải từ hôm nay trở đi."],
    ]);

    const none = projectQuoteFormSchema.safeParse({
      lines: [{ designId: D1, chosen: false, cartons: "" }],
      desiredDeliveryDate: "",
    });
    expect(none.error?.issues.map((issue) => issue.path.join("."))).toEqual(["lines"]);
  });
});

describe("the BE's answer", () => {
  it("parses a request with its nulls left out", () => {
    const parsed = designQuoteRequestDtoSchema.parse({
      id: "7d51f000-0000-4000-8000-0000000000a1",
      designId: D1,
      designName: "Ly",
      designStatus: "PENDING_REVIEW",
      customerId: D2,
      sku: "CUP-12",
      cartons: 120,
      status: "OPEN",
      requestedBy: D2,
      requestedAt: "2026-11-18T03:04:05Z",
    });
    expect(parsed).toMatchObject({ cartons: 120, status: "OPEN" });
    expect(parsed.customerSku).toBeUndefined();
    expect(parsed.desiredDeliveryDate).toBeUndefined();
  });
});

describe("field errors of a refusal", () => {
  it("names the fields of A-1 and, under `quoteRequest.`, of a submission", () => {
    const refusal = (field: string) =>
      new ApiError(400, "VALIDATION_FAILED", "Dữ liệu không hợp lệ.", [
        { field, message: "Sai", code: "Min" },
      ]);
    expect(quoteFieldErrorsOf(refusal("cartons"))).toEqual({ cartons: "Sai" });
    expect(
      quoteFieldErrorsOf(refusal("quoteRequest.desiredDeliveryDate"), "quoteRequest."),
    ).toEqual({ desiredDeliveryDate: "Sai" });
    expect(quoteFieldErrorsOf(refusal("quoteRequest.cartons"))).toBeNull();
    expect(quoteFieldErrorsOf(new Error("x"))).toBeNull();
  });

  it("names a project request's lines by the index sent", () => {
    const error = new ApiError(400, "VALIDATION_FAILED", "Dữ liệu không hợp lệ.", [
      { field: "lines[1].cartons", message: "Quá nhiều" },
      { field: "desiredDeliveryDate", message: "Đã qua" },
    ]);
    const found = projectQuoteFieldErrorsOf(error);
    expect(found?.desiredDeliveryDate).toBe("Đã qua");
    expect([...(found?.cartons ?? [])]).toEqual([[1, "Quá nhiều"]]);
  });
});

describe("which designs can carry a request", () => {
  it("an approved one, one waiting for review, a returned draft; never a plain draft", () => {
    const returned = { reason: "Sửa", returnedAt: "2026-11-17T00:00:00Z" };
    expect(mayHaveQuoteRequest({ status: "APPROVED", lastReturn: null })).toBe(true);
    expect(mayHaveQuoteRequest({ status: "PENDING_REVIEW", lastReturn: null })).toBe(true);
    expect(mayHaveQuoteRequest({ status: "DRAFT", lastReturn: returned })).toBe(true);
    expect(mayHaveQuoteRequest({ status: "DRAFT", lastReturn: null })).toBe(false);
  });
});
