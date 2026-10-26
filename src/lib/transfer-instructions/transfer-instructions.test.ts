import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api/client";

import { getTransferInstructions } from "./api";
import { transferInstructionsDtoSchema } from "./schemas";

const ORDER_ID = "7c1f6f0e-3c36-4e0e-9a43-2b0f0d6a1c11";
const dto = {
  orderId: ORDER_ID,
  orderNumber: "SO-20261023-0007",
  bankName: "Vietcombank",
  accountNumber: "0071000888999",
  accountName: "CONG TY TNHH STOCKFLOW",
  transferReference: "SO-20261023-0007",
  amountDue: 3_750_000,
  currency: "VND",
  dueBy: "TO_CONFIRM",
  dueByNote: "Đơn được xác nhận khi nhận đủ tiền cọc.",
};

afterEach(() => vi.restoreAllMocks());

describe("transfer instructions", () => {
  it("parses the BE response", () => {
    expect(transferInstructionsDtoSchema.parse(dto)).toMatchObject({
      accountNumber: "0071000888999",
      amountDue: 3_750_000,
      dueBy: "TO_CONFIRM",
    });
  });

  it("reads a dueBy newer than this FE as UNKNOWN and allows a missing note", () => {
    const { dueByNote: _note, ...rest } = dto;
    expect(transferInstructionsDtoSchema.parse({ ...rest, dueBy: "SOON" }).dueBy).toBe("UNKNOWN");
  });

  it("is a contract error when the amount is missing", () => {
    const { amountDue: _amount, ...rest } = dto;
    expect(transferInstructionsDtoSchema.safeParse(rest).success).toBe(false);
  });

  it("asks the customer's own order endpoint", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValue({ data: dto });
    await getTransferInstructions(ORDER_ID);
    expect(get).toHaveBeenCalledWith(`/orders/me/${ORDER_ID}/transfer-instructions`, {});
  });
});
