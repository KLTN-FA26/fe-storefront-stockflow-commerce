import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api/client";

import {
  getMyEInvoice,
  getMyEInvoiceFile,
  listMyEInvoiceErrorNotices,
  listMyEInvoices,
} from "../api";
import { customerEInvoiceDtoSchema, customerEInvoiceErrorNoticeDtoSchema } from "../schemas";
import { errorNoticeStatusMeta, invoiceNumberText, invoiceStatusMeta } from "../selectors";
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
    // BE CustomerEInvoiceController.list narrows to one of the customer's orders by `orderId`.
    await listMyEInvoices({ page: 0, size: 200, orderId: beInvoice().orderId });
    expect(get).toHaveBeenNthCalledWith(1, "/einvoices/me", {
      params: { page: 0, size: 200, orderId: beInvoice().orderId },
    });
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

/** BE `CustomerEInvoiceErrorNoticeResponse` as JSON (NON_NULL drops the null fields). */
const beNotice = (over: Record<string, unknown> = {}) => ({
  id: "0e550000-0000-4000-8000-000000000001",
  einvoiceId: beInvoice().id,
  formCode: "04/SS-HDDT",
  formName: "04/SS-HĐĐT",
  reason: "Sai tên công ty trên hoá đơn",
  correctBuyerName: "Công ty TNHH Quán cà phê Mộc",
  status: "SENT",
  recordedAt: "2026-11-11T03:00:00Z",
  ...over,
});

describe("one invoice by id and its error notices (WF-05 F-19, SF-03)", () => {
  it("reads one of the customer's invoices and its 04/SS notices from the customer's endpoints", async () => {
    const get = vi
      .spyOn(api, "get")
      .mockResolvedValueOnce({ data: beInvoice() })
      .mockResolvedValueOnce({ data: [beNotice()] });
    expect((await getMyEInvoice(beInvoice().id)).orderId).toBe(beInvoice().orderId);
    expect(get).toHaveBeenNthCalledWith(1, `/einvoices/me/${beInvoice().id}`, {});
    const notices = await listMyEInvoiceErrorNotices(beInvoice().id);
    expect(get).toHaveBeenNthCalledWith(2, `/einvoices/me/${beInvoice().id}/error-notices`, {});
    expect(notices[0]).toMatchObject({ correctBuyerName: "Công ty TNHH Quán cà phê Mộc" });
    // Absent JSON fields read as missing, never as a contract error.
    expect(notices[0]?.correctBuyerAddress).toBeUndefined();
  });

  it("says 'sent to the tax authority' only when the BE recorded it as sent (Q-22 §4.4)", () => {
    const meta = (status: string) =>
      errorNoticeStatusMeta(customerEInvoiceErrorNoticeDtoSchema.parse(beNotice({ status })));
    expect(meta("DRAFT").label).toBe("Người bán đã ghi nhận");
    expect(meta("DRAFT").label).not.toMatch(/thuế/);
    expect(meta("SENT").label).toBe("Đã gửi cơ quan thuế");
    expect(meta("ACCEPTED").label).toBe("Cơ quan thuế đã tiếp nhận");
    expect(meta("REJECTED").label).toBe("Cơ quan thuế không tiếp nhận");
    // A status newer than the FE claims nothing.
    expect(meta("SOMETHING_NEW")).toEqual({ label: "Đang cập nhật", tone: "neutral" });
  });
});
