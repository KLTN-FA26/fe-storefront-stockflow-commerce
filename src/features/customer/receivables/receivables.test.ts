import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api/client";

import { getMyReceivables } from "./api";
import { receivablePageDtoSchema } from "./schemas";

const row = {
  receivableId: "7c1f6f0e-3c36-4e0e-9a43-2b0f0d6a1c11",
  orderId: "0b3f6f0e-3c36-4e0e-9a43-2b0f0d6a1c22",
  customerId: "5a1f6f0e-3c36-4e0e-9a43-2b0f0d6a1c33",
  kind: "CREDIT_ORDER",
  collector: "CUSTOMER",
  amount: 1_000_000,
  paidAmount: 200_000,
  outstanding: 800_000,
  currency: "VND",
  issuedAt: "2026-09-01T03:00:00Z",
  dueDate: "2026-10-13",
  status: "OVERDUE",
};
const page = (items: unknown[]) => ({
  items,
  page: 0,
  size: 10,
  totalElements: items.length,
  totalPages: 1,
  hasNext: false,
  hasPrevious: false,
});

afterEach(() => vi.restoreAllMocks());

describe("receivables/me", () => {
  it("parses a page and ignores the fields the portal does not read", () => {
    const parsed = receivablePageDtoSchema.parse(page([row]));
    expect(parsed.items[0]).toMatchObject({ outstanding: 800_000, status: "OVERDUE" });
  });

  it("reads a status or kind newer than this FE as UNKNOWN, and a missing due date", () => {
    const { dueDate: _due, ...rest } = row;
    const parsed = receivablePageDtoSchema.parse(
      page([{ ...rest, status: "DISPUTED", kind: "SOMETHING_NEW" }]),
    );
    expect(parsed.items[0]).toMatchObject({ status: "UNKNOWN", kind: "UNKNOWN" });
    expect(parsed.items[0]?.dueDate).toBeUndefined();
  });

  it("sends the zero-based page and size", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValue({ data: page([]) });
    await getMyReceivables({ page: 2, size: 10 });
    expect(get).toHaveBeenCalledWith("/receivables/me", { params: { page: 2, size: 10 } });
  });
});
