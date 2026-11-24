import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { InstallmentReceipts } from "@/components/storefront/installment-receipts";
import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/error";
import { beInvoice } from "@/lib/einvoices/__tests__/fixtures";
import { customerEInvoiceDtoSchema } from "@/lib/einvoices";
import { installmentDtoSchema } from "@/lib/installments";
import { beInstallment } from "@/lib/installments/__tests__/fixtures";
import { renderWithProviders, signIn, signOut } from "@/test/render";

import { OrderContractCard } from "../components/order-contract-card";
import { InvoiceRow } from "../components/order-invoice-row";
import { OrderRefundCard } from "../components/order-refund-card";
import { orderDtoSchema } from "../schemas";
import { beOrder, orderId } from "./fixtures";

// Documents/endpoints.md: the customer's papers, each a GET answering the PDF with its Vietnamese name.
const pdf = new Blob(["%PDF-1.4"], { type: "application/pdf" });
const disposition = (name: string) => ({
  "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(name)}`,
});

type Route = () => unknown;
function backend(permissions: string[], routes: Record<string, Route>) {
  return vi.spyOn(api, "get").mockImplementation(async (url: string) => {
    if (url === "/identity/me/permissions")
      return { data: { roles: ["CUSTOMER"], permissions, dataScope: "OWN" } };
    const route = routes[url];
    if (!route) throw new ApiError(404, "NOT_FOUND", url);
    const answer = route();
    if (answer instanceof ApiError) throw answer;
    return answer as object;
  });
}
const json = (data: unknown) => () => ({ data });
const file = (name: string) => () => ({ data: pdf, headers: disposition(name) });

let saved: string[] = [];
beforeEach(() => {
  signIn();
  saved = [];
  Object.assign(URL, { createObjectURL: vi.fn(() => "blob:paper"), revokeObjectURL: vi.fn() });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    saved.push(this.download);
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  signOut();
});

const contract = {
  id: "c0a70000-0000-4000-8000-000000000001",
  contractNumber: "HD-20260910-900001-1",
  orderId,
  orderNumber: "SO-20260910-900001",
  status: "SIGNED",
  signedOn: "2026-11-18",
  seller: { name: "Công ty TNHH StockFlow" },
  buyer: { name: "Khách hàng demo" },
  totals: { netAmount: 1, taxAmount: 0, totalAmount: 1, currency: "VND" },
  deliverySchedule: [],
  paymentPlan: [],
  appendixAvailable: true,
  version: 3,
};

describe("contract papers on the order page (documents 1c, 2c)", () => {
  it("offers the appendix once signed, and the liquidation once the order ended", async () => {
    backend([], {
      [`/orders/me/${orderId}/contract`]: json(contract),
      [`/orders/me/${orderId}/contract/liquidation`]: file(
        "Biên bản thanh lý hợp đồng TL-HD-20260910-900001-1.pdf",
      ),
    });
    renderWithProviders(<OrderContractCard orderId={orderId} orderStatus="COMPLETED" />);
    expect(await screen.findByRole("button", { name: /phụ lục hợp đồng/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /biên bản thanh lý/ }));
    await vi.waitFor(() =>
      expect(saved).toEqual(["Biên bản thanh lý hợp đồng TL-HD-20260910-900001-1.pdf"]),
    );
  });

  it("says in Vietnamese that there is no appendix when nothing moved (404)", async () => {
    backend([], {
      [`/orders/me/${orderId}/contract`]: json(contract),
      [`/orders/me/${orderId}/contract/appendix`]: () =>
        new ApiError(404, "NOT_FOUND", "Contract was not changed since it was signed"),
    });
    renderWithProviders(<OrderContractCard orderId={orderId} orderStatus="DELIVERED" />);
    await userEvent.click(await screen.findByRole("button", { name: /phụ lục hợp đồng/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Hợp đồng chưa có phụ lục: lịch giao hàng chưa thay đổi so với hợp đồng đã ký.",
    );
    // Still being performed: no liquidation offered.
    expect(screen.queryByRole("button", { name: /biên bản thanh lý/ })).toBeNull();
  });

  it("offers no appendix while the BE says there is none (appendixAvailable=false)", async () => {
    backend([], {
      [`/orders/me/${orderId}/contract`]: json({ ...contract, appendixAvailable: false }),
    });
    renderWithProviders(<OrderContractCard orderId={orderId} orderStatus="COMPLETED" />);
    expect(await screen.findByRole("button", { name: /biên bản thanh lý/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /phụ lục hợp đồng/ })).toBeNull();
  });

  it("shows the BE's refusal of a liquidation while money is still open, in Vietnamese", async () => {
    backend([], {
      [`/orders/me/${orderId}/contract`]: json({ ...contract, status: "COMPLETED" }),
      [`/orders/me/${orderId}/contract/liquidation`]: () =>
        new ApiError(409, "SALES_CONTRACT_STATUS_INVALID", "Balance is not zero"),
    });
    renderWithProviders(<OrderContractCard orderId={orderId} orderStatus="CLOSED" />);
    await userEvent.click(await screen.findByRole("button", { name: /biên bản thanh lý/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/số còn lại phải bằng 0/);
  });

  it("names the amounts left when the BE refuses with details.reason NOT_SETTLED", async () => {
    backend([], {
      [`/orders/me/${orderId}/contract`]: json({ ...contract, status: "COMPLETED" }),
      [`/orders/me/${orderId}/contract/liquidation`]: () =>
        new ApiError(409, "SALES_CONTRACT_STATUS_INVALID", "Not settled", undefined, undefined, {
          reason: "NOT_SETTLED",
          outstanding: 75600000,
          toRefund: 0,
        }),
    });
    renderWithProviders(<OrderContractCard orderId={orderId} orderStatus="CLOSED" />);
    await userEvent.click(await screen.findByRole("button", { name: /biên bản thanh lý/ }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/bạn còn phải thanh toán 75\.600\.000/);
    expect(alert).not.toHaveTextContent(/hoàn cho bạn/);
  });

  it("offers neither before the contract is signed", async () => {
    backend([], {
      [`/orders/me/${orderId}/contract`]: json({
        ...contract,
        status: "SENT",
        signedOn: undefined,
      }),
    });
    renderWithProviders(<OrderContractCard orderId={orderId} orderStatus="PENDING_CONTRACT" />);
    expect(await screen.findByText("HD-20260910-900001-1")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /phụ lục hợp đồng/ })).toBeNull();
  });
});

describe("refund confirmation and the waived shipping fee (documents 4c, Q-19)", () => {
  const refund = {
    orderId,
    orderNumber: beOrder.orderNumber,
    currency: "VND",
    refundStatus: "PARTIALLY_REFUNDED",
    refundable: 500_000,
    refunded: 300_000,
    remaining: 200_000,
    settlements: [
      { kind: "SHIPMENT_RETURNED", shippingFeeWaived: 33_000 },
      { kind: "GOODS_RETURNED", shippingFeeWaived: 0 },
    ],
    records: [
      {
        refundRecordId: "4e5f0000-0000-4000-8000-000000000001",
        amount: 300_000,
        currency: "VND",
        refundedOn: "2026-11-20",
        reference: "FT26324000001",
      },
    ],
    feeOwed: 0,
  };
  const order = orderDtoSchema.parse({ ...beOrder, status: "PARTIALLY_REFUNDED" });

  it("shows the fee the BE waived and downloads each refund's confirmation", async () => {
    backend(["payment-refunds:READ"], {
      [`/refunds/me/orders/${orderId}`]: json(refund),
      "/refunds/me/records/4e5f0000-0000-4000-8000-000000000001/confirmation": file(
        "Phiếu hoàn tiền PHT-261120-4E5F00.pdf",
      ),
    });
    renderWithProviders(<OrderRefundCard order={order} />);
    const waived = await screen.findByText("Phí vận chuyển được miễn");
    expect(waived.nextElementSibling).toHaveTextContent(/33\.000/);
    expect(screen.queryByText("Phí còn phải thanh toán")).toBeNull();
    await userEvent.click(
      screen.getByRole("button", { name: "Tải phiếu hoàn tiền FT26324000001" }),
    );
    await vi.waitFor(() => expect(saved).toEqual(["Phiếu hoàn tiền PHT-261120-4E5F00.pdf"]));
  });

  it("says nothing about a shipping fee the BE did not waive", async () => {
    backend(["payment-refunds:READ"], {
      [`/refunds/me/orders/${orderId}`]: json({ ...refund, settlements: [] }),
    });
    renderWithProviders(<OrderRefundCard order={order} />);
    expect(await screen.findByText("Số tiền phải hoàn")).toBeInTheDocument();
    expect(screen.queryByText(/phí vận chuyển/i)).toBeNull();
  });
});

describe("payment confirmations of an installment (document 5c)", () => {
  const installment = installmentDtoSchema.parse(beInstallment());
  const detail = beInstallment({
    receipts: [
      {
        receiptId: "7a8b0000-0000-4000-8000-000000000001",
        reference: "FT26251000001",
        receivedOn: "2026-09-08",
        amount: 152_100,
        status: "RECORDED",
        recordedAt: "2026-09-08T03:00:00Z",
      },
    ],
  });

  it("lists the receipts when opened and downloads one's confirmation", async () => {
    const get = backend([], {
      [`/installments/me/${installment.installmentId}`]: json(detail),
      [`/installments/me/${installment.installmentId}/receipts/7a8b0000-0000-4000-8000-000000000001/confirmation`]:
        file("Phiếu xác nhận thanh toán XNTT-260908-7A8B00-1.pdf"),
    });
    renderWithProviders(<InstallmentReceipts installment={installment} />);
    expect(get).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: /Các lần đã thanh toán/ }));
    const list = await screen.findByRole("list", { name: "Các khoản đã thanh toán" });
    expect(within(list).getByText("FT26251000001")).toBeInTheDocument();
    await userEvent.click(
      within(list).getByRole("button", { name: "Tải phiếu xác nhận thanh toán FT26251000001" }),
    );
    await vi.waitFor(() =>
      expect(saved).toEqual(["Phiếu xác nhận thanh toán XNTT-260908-7A8B00-1.pdf"]),
    );
  });

  it("is not offered for an installment nothing was paid on", () => {
    const { container } = renderWithProviders(
      <InstallmentReceipts
        installment={installmentDtoSchema.parse(
          beInstallment({ paidAmount: 0, outstanding: 152_100, status: "DUE" }),
        )}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe("invoice row: the correction agreement and the file errors (document 7c, G3)", () => {
  it("offers the agreement on an adjustment, not on an original", async () => {
    const adjustment = customerEInvoiceDtoSchema.parse(beInvoice({ type: "ADJUSTMENT" }));
    backend([], {
      [`/einvoices/me/${adjustment.id}/agreement/draft`]: file(
        "Biên bản thỏa thuận điều chỉnh hóa đơn BBTT-1C26TAA-42.pdf",
      ),
    });
    renderWithProviders(<InvoiceRow invoice={adjustment} />);
    await userEvent.click(screen.getByRole("button", { name: /biên bản thỏa thuận/ }));
    await vi.waitFor(() =>
      expect(saved).toEqual(["Biên bản thỏa thuận điều chỉnh hóa đơn BBTT-1C26TAA-42.pdf"]),
    );

    renderWithProviders(<InvoiceRow invoice={customerEInvoiceDtoSchema.parse(beInvoice())} />);
    expect(screen.getAllByRole("button", { name: /biên bản thỏa thuận/ })).toHaveLength(1);
  });

  it("reads 404 EINVOICE_NOT_FOUND on a file link in Vietnamese", async () => {
    const invoice = customerEInvoiceDtoSchema.parse(beInvoice());
    backend([], {
      [`/einvoices/me/${invoice.id}/files/PDF`]: () =>
        new ApiError(404, "EINVOICE_NOT_FOUND", "No such invoice"),
    });
    renderWithProviders(<InvoiceRow invoice={invoice} />);
    await userEvent.click(screen.getByRole("button", { name: /Tải PDF/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /Không tìm thấy hoá đơn này trong tài khoản của bạn/,
    );
  });
});
