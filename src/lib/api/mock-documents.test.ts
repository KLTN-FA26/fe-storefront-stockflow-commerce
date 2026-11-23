import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getMyContractLiquidation, getMyDebtReconciliation } from "@/lib/documents";
import { getMyInstallment, listMyInstallments } from "@/lib/installments";
import { signIn, signOut } from "@/test/render";

import { activateMockAdapter } from "./mock-adapter";

activateMockAdapter();

beforeEach(() => {
  signIn();
  // Above the 5 % chance of the mock's random 500.
  vi.spyOn(Math, "random").mockReturnValue(0.5);
});
afterEach(() => {
  signOut();
  vi.restoreAllMocks();
});

describe("mock business papers (documents/endpoints.md)", () => {
  it("answers a PDF named like the BE's Content-Disposition", async () => {
    const file = await getMyContractLiquidation("0b7d3c1e-0000-4000-8000-00000000abcd", "HD-1");
    expect(file.fileName).toBe("Biên bản thanh lý hợp đồng TL-HD-00ABCD.pdf");
    expect(file.blob.type).toBe("application/pdf");
  });

  it("refuses a reconciliation period ending after today, as the BE does (400)", async () => {
    await expect(getMyDebtReconciliation("2026-01-01", "2999-01-01")).rejects.toMatchObject({
      status: 400,
      code: "VALIDATION_FAILED",
    });
    const today = new Date().toISOString().slice(0, 10);
    expect((await getMyDebtReconciliation(`${today.slice(0, 4)}-01-01`, today)).fileName).toMatch(
      /^Biên bản đối chiếu công nợ BBDCCN-/,
    );
  });

  it("gives a paid installment's detail its receipt, so its confirmation can be asked for", async () => {
    const page = await listMyInstallments({ page: 0, size: 200 });
    const paid = page.items.find((installment) => installment.paidAmount > 0);
    expect(paid).toBeDefined();
    const detail = await getMyInstallment(paid!.installmentId);
    expect(detail.receipts).toHaveLength(1);
    expect(detail.receipts?.[0]).toMatchObject({ status: "RECORDED", amount: paid!.paidAmount });
  });
});
