import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getMySalesOptions,
  getMySalesOwner,
  listMyOwnerChangeRequests,
  submitOwnerChangeRequest,
} from "@/features/customer/sales-owner/api";
import { submitLead } from "@/features/lead/api";

import { ApiError } from "./error";
import { activateMockAdapter } from "./mock-adapter";
import { createMockSalesOwnerBook, MOCK_SALES_OPTIONS } from "./mock-fixtures/sales-owner";
import { resetMockSalesOwner } from "./mock-sales-owner";

activateMockAdapter();

beforeEach(() => {
  // No random 500 from the mock adapter.
  vi.spyOn(Math, "random").mockReturnValue(0.5);
  resetMockSalesOwner();
});
afterEach(() => vi.restoreAllMocks());

const refusal = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (error: unknown) => error,
  );

describe("sales owner mock routes through the feature's own API (KE-HOACH sales owner §10.5)", () => {
  it("answers the customer's Sales, with the cover, and the Sales to choose from", async () => {
    expect(await getMySalesOwner()).toEqual({
      name: "Trần Minh Khoa",
      active: true,
      coverName: "Lê Thu Hà",
    });
    expect(await getMySalesOptions()).toEqual(MOCK_SALES_OPTIONS);
  });

  it("keeps one open request at a time, then 30 days after a decision", async () => {
    expect(await listMyOwnerChangeRequests()).toEqual([]);
    await submitOwnerChangeRequest({ reason: "SLOW_RESPONSE", note: "" });
    expect((await listMyOwnerChangeRequests())?.[0]?.status).toBe("PENDING");

    const pending = await refusal(submitOwnerChangeRequest({ reason: "OTHER", note: "x" }));
    expect(pending).toBeInstanceOf(ApiError);
    expect((pending as ApiError).code).toBe("OWNER_CHANGE_REQUEST_PENDING");

    resetMockSalesOwner(
      createMockSalesOwnerBook(undefined, undefined, [
        {
          id: "r-1",
          status: "REJECTED",
          reason: "SLOW_RESPONSE",
          note: "",
          preferredSalesName: null,
          decisionNote: "Không",
          createdAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
          decidedAt: new Date(Date.now() - 86_400_000).toISOString(),
        },
      ]),
    );
    const cooldown = await refusal(submitOwnerChangeRequest({ reason: "OTHER", note: "x" }));
    expect((cooldown as ApiError).code).toBe("OWNER_CHANGE_REQUEST_COOLDOWN");
  });

  it("takes a lead and answers the same receipt for any company", async () => {
    await expect(
      submitLead({
        companyName: "Công ty A",
        taxCode: "0312345678",
        contactName: "An",
        phone: "0908123456",
        email: "an@a.vn",
        province: "Hà Nội",
        interests: ["CUP"],
        consent: true,
      }),
    ).resolves.toBeUndefined();
  });
});
