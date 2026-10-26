import { describe, expect, it } from "vitest";

import { formatDateTime } from "@/lib/format";

import { decisionView, defaultDesignName, designCardView } from "../selectors";
import { designDraft, ids, proposedDraftFields } from "./fixtures";

describe("designCardView", () => {
  it("shows the name, the SKU, the update time and the lifecycle state of a P6 draft", () => {
    const view = designCardView(
      designDraft({ ...proposedDraftFields, reviewRequestedAt: undefined, reviewedAt: undefined }),
    );
    expect(view).toEqual({
      title: "Ly giấy logo quán",
      subtitle: "CUP-PAPER-12OZ-WHT · CUP12-BODY",
      updatedLabel: formatDateTime("2026-10-25T08:00:00Z"),
      state: "editing",
    });
  });

  it("has no subtitle and no update time on a real-BE draft (no P6 fields)", () => {
    expect(designCardView(designDraft({ currentArtifactId: ids.artifact }))).toEqual({
      title: "Ly giấy logo quán",
      subtitle: "",
      updatedLabel: null,
      state: "awaitingReview",
    });
  });

  it("shows an edited design that was already sent to QC as editing again", () => {
    expect(
      designCardView(
        designDraft({
          ...proposedDraftFields,
          currentArtifactId: ids.artifact,
          reviewRequestedAt: undefined,
          reviewedAt: undefined,
        }),
      ).state,
    ).toBe("editing");
  });

  it("falls back to the template code when the SKU is absent", () => {
    expect(designCardView(designDraft({ templateCode: "BAG-M" })).subtitle).toBe("BAG-M");
  });

  it("does not throw on a timestamp it cannot read", () => {
    expect(designCardView(designDraft({ updatedAt: "not a date" })).updatedLabel).toBeNull();
  });
});

describe("defaultDesignName", () => {
  it("is the template name and the day and month in Ho Chi Minh time", () => {
    // 17:30 UTC on the 25th is already the 26th at 00:30 in Vietnam.
    expect(defaultDesignName("Ly giấy 12oz – in thân ly", new Date("2026-10-25T17:30:00Z"))).toBe(
      "Ly giấy 12oz – in thân ly – 26/10",
    );
    expect(defaultDesignName("Túi kraft", new Date("2026-01-05T03:00:00Z"))).toBe(
      "Túi kraft – 05/01",
    );
  });

  it("keeps a long template name inside the 200 characters the BE accepts", () => {
    const name = defaultDesignName("x".repeat(300), new Date("2026-10-25T03:00:00Z"));
    expect(name).toHaveLength(200);
    expect(name.endsWith(" – 25/10")).toBe(true);
  });
});

describe("decisionView", () => {
  const at = "2026-10-25T09:30:00Z";

  it("names a decision and keeps the notes written for the customer", () => {
    expect(
      decisionView({ decision: "TECHNICAL_REJECTED", notes: " Logo mờ ", version: 4, at }),
    ).toEqual({ label: "QC yêu cầu sửa", notes: "Logo mờ", atLabel: formatDateTime(at) });
  });

  it("leaves out notes that are not for the customer, and shows an unknown code as it is", () => {
    expect(
      decisionView({ decision: "SENT_TO_CUSTOMER", notes: "internal remark", version: 5, at }),
    ).toMatchObject({ label: "Sales gửi thiết kế để bạn xác nhận", notes: null });
    expect(decisionView({ decision: "SOMETHING_NEW", version: 6, at })).toMatchObject({
      label: "SOMETHING_NEW",
      notes: null,
    });
  });
});
