import { describe, expect, it } from "vitest";

import {
  contractStatusMeta,
  installmentStatusMeta as chatInstallmentStatusMeta,
  milestoneLabel,
  quoteStatusMeta,
} from "@/features/chat/labels";
import { CONTRACT_STATUS_META } from "@/features/order/contract-labels";
import { QUOTE_STATUS_META } from "@/features/quote/lifecycle";
import { INSTALLMENT_MILESTONE_LABEL, installmentStatusMeta } from "@/lib/installments";

import {
  CONTRACT_STATUS,
  INSTALLMENT_MILESTONE,
  INSTALLMENT_STATUS,
  QUOTE_STATUS,
  installmentStatusOf,
  milestoneLabelOf,
  statusMetaOf,
} from "./status-map";

describe("one status map per domain (SF-UX-2)", () => {
  it("words the statuses that wait on the customer from their side", () => {
    expect(QUOTE_STATUS.SENT).toEqual({ label: "Chờ bạn phản hồi", tone: "warning" });
    expect(CONTRACT_STATUS.SENT).toEqual({ label: "Chờ bạn ký", tone: "warning" });
  });

  it("gives the quote page and the chat card the same label and tone", () => {
    for (const status of Object.keys(QUOTE_STATUS) as (keyof typeof QUOTE_STATUS)[]) {
      if (status === "UNKNOWN") continue;
      const page = QUOTE_STATUS_META[status];
      expect(quoteStatusMeta(status)).toEqual({ label: page.label, tone: page.tone });
    }
  });

  it("gives the contract card and the chat card the same label and tone", () => {
    for (const status of ["SENT", "SIGNED", "COMPLETED", "CANCELLED"] as const) {
      expect(contractStatusMeta(status)).toEqual(CONTRACT_STATUS_META[status]);
    }
  });

  it("gives installments and milestones the same words on the page and in chat", () => {
    for (const status of ["NOT_DUE", "DUE", "PARTIALLY_PAID", "PAID", "CANCELLED"] as const) {
      expect(chatInstallmentStatusMeta(status, false)).toEqual(
        installmentStatusMeta({ status, overdue: false }),
      );
    }
    expect(chatInstallmentStatusMeta("DUE", true)).toEqual({ label: "Quá hạn", tone: "danger" });
    for (const milestone of ["ON_SIGNING", "BEFORE_DELIVERY", "AFTER_DELIVERY"] as const) {
      expect(milestoneLabel(milestone)).toBe(INSTALLMENT_MILESTONE_LABEL[milestone]);
    }
  });

  it("never calls a paid or cancelled installment overdue", () => {
    expect(installmentStatusOf("PAID", true)).toEqual(INSTALLMENT_STATUS.PAID);
    expect(installmentStatusOf("CANCELLED", true)).toEqual(INSTALLMENT_STATUS.CANCELLED);
    expect(installmentStatusOf("PARTIALLY_PAID", true).label).toBe("Quá hạn");
  });

  it("falls back to neutral wording for a value newer than this FE", () => {
    expect(statusMetaOf(QUOTE_STATUS, "SOMETHING_NEW", "Báo giá")).toEqual({
      label: "Báo giá",
      tone: "neutral",
    });
    expect(milestoneLabelOf("SOMETHING_NEW")).toBe(INSTALLMENT_MILESTONE.UNKNOWN);
    expect(installmentStatusOf("SOMETHING_NEW", false).tone).toBe("neutral");
  });
});
