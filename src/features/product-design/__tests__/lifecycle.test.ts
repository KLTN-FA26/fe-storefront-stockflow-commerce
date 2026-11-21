import { describe, expect, it } from "vitest";

import {
  DESIGN_STATUS_META,
  DESIGN_TRANSITIONS,
  RETURNED_META,
  TERMINAL_STATUSES,
  allowedActions,
  isReturned,
  type DesignAction,
} from "../lifecycle";
import type { DesignStatus } from "../types";
import { design, returnedDto } from "./fixtures";

const STATUSES = [
  "DRAFT",
  "PENDING_REVIEW",
  "APPROVED",
  "ARCHIVED",
] as const satisfies readonly DesignStatus[];

/** Spec 2026-11-09 §3.2: every move the docs allow; anything else is refused. */
const ALLOWED: ReadonlyArray<[DesignStatus, DesignStatus]> = [
  ["DRAFT", "DRAFT"], // save, version + 1
  ["DRAFT", "PENDING_REVIEW"], // submit, preflight Pass
  ["DRAFT", "ARCHIVED"], // delete
  ["PENDING_REVIEW", "APPROVED"], // approve
  ["PENDING_REVIEW", "DRAFT"], // return with a reason
];

const PAIRS = STATUSES.flatMap((from) => STATUSES.map((to) => [from, to] as const));

describe("DESIGN_TRANSITIONS (spec §3.2)", () => {
  it.each(PAIRS)("%s → %s is allowed exactly as the docs say", (from, to) => {
    const expected = ALLOWED.some(([f, t]) => f === from && t === to);
    expect(DESIGN_TRANSITIONS[from].includes(to)).toBe(expected);
  });

  it("makes APPROVED and ARCHIVED terminal: no way out of either", () => {
    expect([...TERMINAL_STATUSES].sort()).toEqual(["APPROVED", "ARCHIVED"]);
    for (const status of TERMINAL_STATUSES) expect(DESIGN_TRANSITIONS[status]).toEqual([]);
  });

  it("leaves a way out of every status that is not terminal", () => {
    for (const status of STATUSES.filter((s) => !TERMINAL_STATUSES.has(s))) {
      expect(DESIGN_TRANSITIONS[status].length).toBeGreaterThan(0);
    }
  });
});

describe("allowedActions (spec §3.1)", () => {
  it.each([
    ["DRAFT", ["edit", "rename", "save", "submit", "delete"]],
    ["PENDING_REVIEW", []],
    ["APPROVED", ["createRevision", "requestQuote"]],
    ["ARCHIVED", []],
  ] as const satisfies ReadonlyArray<readonly [DesignStatus, readonly DesignAction[]]>)(
    "%s allows %j",
    (status, actions) => {
      expect(allowedActions({ status })).toEqual(actions);
    },
  );

  it("is the same for a returned draft as for any draft", () => {
    expect(allowedActions(design(returnedDto()))).toEqual(allowedActions({ status: "DRAFT" }));
  });
});

describe("DESIGN_STATUS_META (spec §3.1)", () => {
  it.each([
    ["DRAFT", "Bản nháp", "neutral", true],
    ["PENDING_REVIEW", "Chờ duyệt", "info", false],
    ["APPROVED", "Đã duyệt", "positive", false],
    ["ARCHIVED", "Đã xoá", "muted", false],
  ] as const)("%s reads %s, tone %s, editable %s", (status, label, tone, editable) => {
    expect(DESIGN_STATUS_META[status]).toMatchObject({ label, tone, editable });
  });

  it("says what happens next in each status", () => {
    expect(DESIGN_STATUS_META.DRAFT.hint).toBe(
      "Thiết kế được lưu tự động. Khi xong, bấm Gửi duyệt.",
    );
    expect(DESIGN_STATUS_META.PENDING_REVIEW.hint).toBe(
      "Thiết kế đang được duyệt. Bạn sẽ nhận kết quả tại đây.",
    );
    expect(DESIGN_STATUS_META.APPROVED.hint).toBe(
      "Thiết kế đã duyệt và không sửa được nữa. Muốn thay đổi, hãy tạo bản sửa.",
    );
    expect(DESIGN_STATUS_META.ARCHIVED.hint).toBe("Bản nháp đã xoá.");
  });

  it("lets the customer edit exactly where `edit` is allowed", () => {
    for (const status of STATUSES) {
      expect(DESIGN_STATUS_META[status].editable).toBe(allowedActions({ status }).includes("edit"));
    }
  });

  it("marks a returned draft 'Bị trả lại' with the warning tone", () => {
    expect(RETURNED_META).toEqual({ label: "Bị trả lại", tone: "warning" });
  });
});

describe("isReturned", () => {
  it("is true only for a DRAFT carrying its latest return", () => {
    expect(isReturned(design(returnedDto()))).toBe(true);
    expect(isReturned(design())).toBe(false);
  });

  it.each(["PENDING_REVIEW", "APPROVED", "ARCHIVED"] as const)(
    "is false for %s even with a return on record",
    (status) => {
      expect(isReturned(design(returnedDto({ status })))).toBe(false);
    },
  );
});
