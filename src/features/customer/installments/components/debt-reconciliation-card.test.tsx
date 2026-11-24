import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/error";
import { vnDayOf } from "@/lib/format/date";
import { renderWithProviders, signIn, signOut } from "@/test/render";

import {
  DebtReconciliationCard,
  defaultReconciliationPeriod,
  reconciliationPeriodError,
} from "./debt-reconciliation-card";

beforeEach(() => signIn());
afterEach(() => {
  vi.restoreAllMocks();
  signOut();
});

describe("Biên bản đối chiếu công nợ (documents/endpoints.md 6c)", () => {
  it("covers this year up to today by default, in Vietnam's calendar", () => {
    // 23:30 UTC on 31/12 is already 1/1 in Vietnam.
    expect(defaultReconciliationPeriod(new Date("2026-12-31T23:30:00Z"))).toEqual({
      from: "2027-01-01",
      to: "2027-01-01",
    });
    expect(defaultReconciliationPeriod(new Date("2026-11-23T03:00:00Z"))).toEqual({
      from: "2026-01-01",
      to: "2026-11-23",
    });
  });

  it("refuses the periods the BE refuses (400), before asking", () => {
    const today = "2026-11-23";
    expect(reconciliationPeriodError("2026-01-01", "2026-11-23", today)).toBeNull();
    expect(reconciliationPeriodError("2026-01-01", "2026-11-24", today)).toMatch(/sau hôm nay/);
    expect(reconciliationPeriodError("2026-11-20", "2026-11-10", today)).toMatch(/trước hoặc bằng/);
    expect(reconciliationPeriodError("", "2026-11-10", today)).toMatch(/chọn đủ/);
  });

  it("downloads the record for the chosen period under the BE's name", async () => {
    Object.assign(URL, { createObjectURL: vi.fn(() => "blob:debt"), revokeObjectURL: vi.fn() });
    const saved: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      saved.push(this.download);
    });
    const name = "Biên bản đối chiếu công nợ BBDCCN-0312345678-20261123.pdf";
    const get = vi.spyOn(api, "get").mockResolvedValue({
      data: new Blob(["%PDF"]),
      headers: { "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(name)}` },
    });
    renderWithProviders(<DebtReconciliationCard />);
    await userEvent.click(screen.getByRole("button", { name: "Tải biên bản đối chiếu" }));
    await vi.waitFor(() => expect(saved).toEqual([name]));
    const today = vnDayOf(new Date());
    expect(get).toHaveBeenCalledWith(
      "/installments/me/debt-reconciliation",
      expect.objectContaining({ params: { from: `${today.slice(0, 4)}-01-01`, to: today } }),
    );
  });

  it("shows a refusal of the BE in Vietnamese", async () => {
    vi.spyOn(api, "get").mockRejectedValue(
      new ApiError(400, "VALIDATION_FAILED", "to must not be after today"),
    );
    renderWithProviders(<DebtReconciliationCard />);
    await userEvent.click(screen.getByRole("button", { name: "Tải biên bản đối chiếu" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Kỳ đối chiếu không hợp lệ/);
  });
});
