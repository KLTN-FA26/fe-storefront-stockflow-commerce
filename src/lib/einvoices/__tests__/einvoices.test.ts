import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api/client";

import { getMyEInvoiceFile, listMyEInvoices } from "../api";
import { customerEInvoiceDtoSchema } from "../schemas";
import { invoiceNumberText, invoiceStatusMeta } from "../selectors";
import { beInvoice } from "./fixtures";

afterEach(() => vi.restoreAllMocks());

describe("customer e-invoices (kltn-docs 21 §4.3, §5.2)", () => {
  it("parses what the BE sends and reads a type or status newer than the FE as UNKNOWN", () => {
    expect(customerEInvoiceDtoSchema.parse(beInvoice()).grandTotal).toBe(547_560);
    const parsed = customerEInvoiceDtoSchema.parse(
      beInvoice({ type: "CREDIT_NOTE", status: "ARCHIVED" }),
    );
    expect(parsed.type).toBe("UNKNOWN");
    expect(parsed.status).toBe("UNKNOWN");
  });

  it("asks the customer's own endpoints", async () => {
    const get = vi
      .spyOn(api, "get")
      .mockResolvedValueOnce({
        data: {
          items: [beInvoice()],
          page: 0,
          size: 200,
          totalElements: 1,
          totalPages: 1,
          hasNext: false,
          hasPrevious: false,
        },
      })
      .mockResolvedValueOnce({
        data: { url: "https://x/a.pdf", expiresAt: "2026-11-10T03:05:00Z" },
      });
    await listMyEInvoices({ page: 0, size: 200 });
    expect(get).toHaveBeenNthCalledWith(1, "/einvoices/me", { params: { page: 0, size: 200 } });
    await getMyEInvoiceFile(beInvoice().id, "PDF");
    expect(get).toHaveBeenLastCalledWith(`/einvoices/me/${beInvoice().id}/files/PDF`);
  });

  it("numbers an invoice by template, symbol and number", () => {
    expect(invoiceNumberText({ templateCode: "1", symbol: "C26TAA", invoiceNumber: 42 })).toBe(
      "1C26TAA-0000042",
    );
  });

  it("states the customer's view: issued, issued with an adjustment, replaced", () => {
    expect(invoiceStatusMeta({ status: "ISSUED", adjusted: false }).label).toBe("Đã phát hành");
    expect(invoiceStatusMeta({ status: "ISSUED", adjusted: true }).label).toBe(
      "Đã phát hành — có điều chỉnh",
    );
    expect(invoiceStatusMeta({ status: "REPLACED", adjusted: false }).label).toBe("Đã bị thay thế");
  });
});
