import { describe, expect, it } from "vitest";

import {
  DESIGN_UI_STATE_META,
  allowedActions,
  deriveUiState,
  type DesignAction,
  type DesignUiState,
} from "../lifecycle";
import { designDraft, ids } from "./fixtures";

const T1 = "2026-10-25T08:00:00Z";
const T2 = "2026-10-25T09:00:00Z";
const A1 = ids.artifact;

const STATES = [
  "editing",
  "awaitingReview",
  "changesRequested",
  "reviewPassed",
  "awaitingConfirmation",
  "confirmed",
] as const satisfies readonly DesignUiState[];

describe("deriveUiState (spec §7.5)", () => {
  it.each([
    [{ status: "APPROVED" }, "confirmed"],
    [{ status: "SUBMITTED" }, "awaitingConfirmation"],
    [{ technicalReviewPassed: true }, "reviewPassed"],
    [{ reviewNotes: "Logo mờ" }, "changesRequested"],
    [{ reviewRequestedAt: T2, updatedAt: T2 }, "awaitingReview"],
    [{ reviewRequestedAt: T1, updatedAt: T2 }, "editing"],
    // The real BE sends none of the P6 fields: an artifact on a DRAFT is a review in progress.
    [
      { currentArtifactId: A1, reviewRequestedAt: undefined, updatedAt: undefined },
      "awaitingReview",
    ],
    [{}, "editing"],
  ])("derives %j as %s", (overrides, state) => {
    expect(deriveUiState(designDraft(overrides))).toBe(state);
  });

  it("keeps a review request current while the document has not changed since", () => {
    expect(deriveUiState(designDraft({ reviewRequestedAt: T2, updatedAt: T1 }))).toBe(
      "awaitingReview",
    );
    // With no `updatedAt` there is no later change to compare with.
    expect(deriveUiState(designDraft({ reviewRequestedAt: T1 }))).toBe("awaitingReview");
  });

  it("compares the P6 instants whatever their sub-second precision", () => {
    expect(
      deriveUiState(
        designDraft({ reviewRequestedAt: "2026-10-25T08:00:00.123456Z", updatedAt: T1 }),
      ),
    ).toBe("awaitingReview");
    expect(
      deriveUiState(designDraft({ reviewRequestedAt: "2026-10-25T07:59:59.999Z", updatedAt: T1 })),
    ).toBe("editing");
  });

  it("ignores the artifact fallback once the P6 fields tell the story", () => {
    expect(
      deriveUiState(designDraft({ currentArtifactId: A1, reviewRequestedAt: T1, updatedAt: T2 })),
    ).toBe("editing");
  });

  it("reads a design whose review was voided as editing: the BE clears reviewRequestedAt, the artifact stays", () => {
    // P6 present (updatedAt), no review request left: any edit or new artifact voids the review.
    expect(deriveUiState(designDraft({ currentArtifactId: A1, updatedAt: T2 }))).toBe("editing");
    expect(
      deriveUiState(designDraft({ currentArtifactId: A1, updatedAt: T2, reviewRequestedAt: null })),
    ).toBe("editing");
  });

  it("says editing for a draft with no artifact and no request, and for a blank note", () => {
    expect(deriveUiState(designDraft({ currentArtifactId: null }))).toBe("editing");
    expect(deriveUiState(designDraft({ reviewNotes: "   ", currentArtifactId: null }))).toBe(
      "editing",
    );
  });

  it("lets the first matching state win, in the order of spec §7.5", () => {
    const everything = {
      technicalReviewPassed: true,
      reviewNotes: "Logo mờ",
      currentArtifactId: A1,
      reviewRequestedAt: T2,
      updatedAt: T2,
    };
    expect(deriveUiState(designDraft({ ...everything, status: "APPROVED" }))).toBe("confirmed");
    expect(deriveUiState(designDraft({ ...everything, status: "SUBMITTED" }))).toBe(
      "awaitingConfirmation",
    );
    expect(deriveUiState(designDraft(everything))).toBe("reviewPassed");
    expect(deriveUiState(designDraft({ ...everything, technicalReviewPassed: false }))).toBe(
      "changesRequested",
    );
    expect(
      deriveUiState(
        designDraft({ ...everything, technicalReviewPassed: false, reviewNotes: null }),
      ),
    ).toBe("awaitingReview");
  });

  it("shows a customer change request (SUBMITTED to DRAFT) with its reason as changesRequested", () => {
    expect(
      deriveUiState(designDraft({ status: "DRAFT", reviewNotes: "Đổi màu nền sang trắng" })),
    ).toBe("changesRequested");
  });

  it("treats the never-set REJECTED status like a draft the BE will refuse to write", () => {
    expect(deriveUiState(designDraft({ status: "REJECTED" }))).toBe("editing");
  });
});

describe("DESIGN_UI_STATE_META", () => {
  it("labels and tones every state as the spec says", () => {
    expect(
      STATES.map((s) => [s, DESIGN_UI_STATE_META[s].label, DESIGN_UI_STATE_META[s].tone]),
    ).toEqual([
      ["editing", "Đang thiết kế", "neutral"],
      ["awaitingReview", "Chờ QC kiểm tra", "info"],
      ["changesRequested", "QC yêu cầu sửa", "warning"],
      ["reviewPassed", "Đạt kỹ thuật", "positive"],
      ["awaitingConfirmation", "Chờ bạn xác nhận", "warning"],
      ["confirmed", "Đã chốt", "positive"],
    ]);
  });

  it("makes the design read-only once it waits for the customer's confirmation or is confirmed", () => {
    expect(STATES.filter((s) => !DESIGN_UI_STATE_META[s].editable)).toEqual([
      "awaitingConfirmation",
      "confirmed",
    ]);
  });

  it("tells the customer what happens next, in one short sentence each", () => {
    expect(DESIGN_UI_STATE_META.editing.hint).toBe(
      "Thiết kế đang được lưu tự động. Khi xong, hãy gửi QC kiểm tra.",
    );
    for (const state of STATES) {
      const { hint } = DESIGN_UI_STATE_META[state];
      expect(hint.trim()).not.toBe("");
      expect(hint.length).toBeLessThanOrEqual(120);
    }
  });
});

describe("allowedActions", () => {
  it("offers finalize only after review passes and fork only when confirmed", () => {
    expect(allowedActions("reviewPassed")).toContain("finalize");
    expect(allowedActions("editing")).not.toContain("finalize");
    expect(allowedActions("confirmed")).toEqual(expect.arrayContaining(["fork", "requestQuote"]));

    const offering = (action: DesignAction) =>
      STATES.filter((s) => allowedActions(s).includes(action));
    expect(offering("finalize")).toEqual(["reviewPassed"]);
    expect(offering("fork")).toEqual(["confirmed"]);
    expect(offering("requestQuote")).toEqual(["confirmed"]);
  });

  it("asks for QC review only while the customer is working or answering QC notes", () => {
    const offering = STATES.filter((s) => allowedActions(s).includes("requestReview"));
    expect(offering).toEqual(["editing", "changesRequested"]);
  });

  it("lets the customer answer a Sales submission three ways", () => {
    expect(allowedActions("awaitingConfirmation")).toEqual([
      "confirm",
      "requestChanges",
      "withdraw",
    ]);
    expect(allowedActions("confirmed")).not.toContain("confirm");
  });

  it("offers edit exactly where the design is editable", () => {
    for (const state of STATES) {
      expect(allowedActions(state).includes("edit")).toBe(DESIGN_UI_STATE_META[state].editable);
    }
  });
});
