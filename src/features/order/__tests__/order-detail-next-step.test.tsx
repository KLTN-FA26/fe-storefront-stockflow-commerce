import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/error";
import { beInstallment, beOrderInstallments } from "@/lib/installments/__tests__/fixtures";
import { renderWithProviders, signIn, signOut } from "@/test/render";

import { OrderDetailScreen } from "../components/order-detail-screen";
import { OrderHelpCard, returnWindowText } from "../components/order-help-card";
import { orderDtoSchema } from "../schemas";
import { beOrder, orderId } from "./fixtures";

vi.mock("next/navigation", () => ({
  notFound: vi.fn(),
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));

const contractId = "c0a70000-0000-4000-8000-000000000009";
const sentContract = {
  id: contractId,
  contractNumber: "HD-20260907-000431-1",
  orderId,
  orderNumber: beOrder.orderNumber,
  status: "SENT",
  totals: { netAmount: 469444, taxAmount: 37556, totalAmount: 507000 },
  returnWindowDays: 10,
  version: 1,
};

/** Routes GET to the order, its contract (404 when none) and its installments (404 when none). */
function backend({
  order,
  contract,
  installments,
}: {
  order: Record<string, unknown>;
  contract?: Record<string, unknown>;
  installments?: Record<string, unknown>;
}) {
  return vi.spyOn(api, "get").mockImplementation(async (url: string) => {
    if (url === "/identity/me/permissions") {
      return { data: { roles: ["CUSTOMER"], permissions: [], dataScope: "OWN" } };
    }
    if (url === `/orders/me/${orderId}`) return { data: order };
    if (url === `/orders/me/${orderId}/contract`) {
      if (contract) return { data: contract };
      throw new ApiError(404, "SALES_CONTRACT_NOT_FOUND", "none");
    }
    if (url === `/installments/me/orders/${orderId}`) {
      if (installments) return { data: installments };
      throw new ApiError(404, "INSTALLMENT_NOT_FOUND", "none");
    }
    if (url.endsWith("/transfer-instructions")) {
      return {
        data: {
          installmentId: "6c7d8e9f-0000-4000-8000-000000000002",
          contractNumber: "HD-20261108-000007-1",
          orderNumber: beOrder.orderNumber,
          seq: 1,
          name: "Đặt cọc",
          bankName: "Vietcombank",
          accountNumber: "0071000888999",
          accountName: "CONG TY TNHH STOCKFLOW",
          amountDue: 152_100,
          currency: "VND",
          reference: "HD-20261108-000007-1 DOT1",
        },
      };
    }
    throw new ApiError(404, "NOT_FOUND", `No fake route for ${url}`);
  });
}

beforeEach(() => signIn());
afterEach(() => {
  vi.restoreAllMocks();
  signOut();
});

describe("order status hero — the next step (SF-UX-29)", () => {
  it("points at the signing steps while it waits, with one download button on the page (sf-07)", async () => {
    backend({
      order: { ...beOrder, status: "PENDING_CONTRACT", statusGroup: "AWAITING_CONTRACT" },
      contract: sentContract,
    });
    renderWithProviders(<OrderDetailScreen orderId={orderId} />);

    const hero = await screen.findByRole("region", { name: "Chờ ký hợp đồng" });
    expect(
      await within(hero).findByRole("link", { name: "Ký hợp đồng: xem 3 bước" }),
    ).toHaveAttribute("href", "#hop-dong");
    expect(within(hero).queryByRole("button", { name: /^Tải hợp đồng/ })).not.toBeInTheDocument();
    // The contract card's step 1 is the one way to download it.
    expect(
      await screen.findByRole("button", { name: "Tải hợp đồng HD-20260907-000431-1" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Tải hợp đồng/ })).toHaveLength(1);
    expect(within(hero).getByRole("listitem", { current: "step" })).toHaveTextContent("Hợp đồng");
  });

  it("pays the installment due now from the hero: its amount and day, and opens its transfer", async () => {
    const plan = beOrderInstallments({
      installments: [
        beInstallment({
          status: "DUE",
          paidAmount: 0,
          outstanding: 152_100,
          dueDate: "2099-11-26",
          paidAt: undefined,
        }),
      ],
    });
    backend({
      order: { ...beOrder, status: "PENDING_PAYMENT", statusGroup: "AWAITING_PAYMENT" },
      installments: plan,
    });
    const user = userEvent.setup();
    renderWithProviders(<OrderDetailScreen orderId={orderId} />);

    const hero = await screen.findByRole("region", { name: "Chờ thanh toán" });
    expect(hero).toHaveTextContent("Hệ thống tự xác nhận khoản chuyển vài giây sau khi tiền về");
    const pay = await within(hero).findByRole("button", {
      name: /^Thanh toán đợt 1: 152\.100\s₫ trước 26\/11$/,
    });
    // The first payable installment is open already; on a phone its card follows the hero.
    expect(await screen.findByText("HD-20261108-000007-1 DOT1")).toBeInTheDocument();
    const payment = screen.getByRole("region", { name: "Thanh toán" });
    expect(hero.compareDocumentPosition(payment) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(
      payment.compareDocumentPosition(screen.getByRole("region", { name: /Sản phẩm/ })) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    // Closed by hand, the hero's button opens it again.
    await user.click(screen.getByRole("button", { name: "Ẩn thông tin chuyển khoản" }));
    expect(screen.queryByText("HD-20261108-000007-1 DOT1")).not.toBeInTheDocument();
    await user.click(pay);
    expect(await screen.findByText("HD-20261108-000007-1 DOT1")).toBeInTheDocument();
    // Brought to the installment itself, for keyboard and screen-reader users too.
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByText("Đợt 1 · Đặt cọc").closest("li")),
    );
  });

  it("names a fee item by its name on the hero and in the payment card, not 'đợt 21' (WF-02 FE-7)", async () => {
    const plan = beOrderInstallments({
      installments: [
        beInstallment({
          seq: 21,
          name: "Cancellation fee",
          milestone: "CANCELLATION_FEE",
          status: "DUE",
          paidAmount: 0,
          outstanding: 500_000,
          dueDate: "2099-11-26",
          paidAt: undefined,
        }),
      ],
    });
    backend({
      order: { ...beOrder, status: "PENDING_PAYMENT", statusGroup: "AWAITING_PAYMENT" },
      installments: plan,
    });
    renderWithProviders(<OrderDetailScreen orderId={orderId} />);

    const hero = await screen.findByRole("region", { name: "Chờ thanh toán" });
    expect(
      await within(hero).findByRole("button", {
        name: /^Thanh toán phí huỷ đơn: 500\.000\s₫ trước 26\/11$/,
      }),
    ).toBeInTheDocument();
    const payment = screen.getByRole("region", { name: "Thanh toán" });
    expect(await within(payment).findByText("Phí huỷ đơn")).toBeInTheDocument();
    expect(within(payment).queryByText(/Đợt 21/)).not.toBeInTheDocument();
  });

  it("shows no next step while the order waits on the shop, and keeps payment unticked while owed", async () => {
    const owed = beOrderInstallments({
      installments: [
        beInstallment({
          status: "NOT_DUE",
          paidAmount: 0,
          outstanding: 152_100,
          paidAt: undefined,
        }),
      ],
    });
    backend({
      order: { ...beOrder, status: "IN_PRODUCTION", statusGroup: "IN_PRODUCTION" },
      installments: owed,
    });
    renderWithProviders(<OrderDetailScreen orderId={orderId} />);

    const hero = await screen.findByRole("region", { name: "Đang sản xuất" });
    await waitFor(() =>
      expect(within(hero).getByText("Thanh toán đợt đầu")).toHaveTextContent("(chưa thanh toán)"),
    );
    expect(within(hero).queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("order page details (SF-UX-31..35)", () => {
  it("shows the lines in cartons and pieces, the design, one total name with its VAT split", async () => {
    backend({
      order: {
        ...beOrder,
        netAmount: 469444,
        taxAmount: 37556,
        lines: [
          {
            ...beOrder.lines[0],
            quantity: 20000,
            cartons: 40,
            unitsPerCarton: 500,
            designName: "Ly cà phê Nhà Mình",
          },
        ],
      },
    });
    renderWithProviders(<OrderDetailScreen orderId={orderId} />);

    const lines = await screen.findByRole("region", { name: /Sản phẩm/ });
    expect(within(lines).getByText("(1 mặt hàng · 40 thùng)")).toBeInTheDocument();
    expect(within(lines).getByText("Ly cà phê Nhà Mình")).toBeInTheDocument();
    expect(within(lines).getByText(/40 thùng \(20\.000 cái\) ×/)).toBeInTheDocument();
    expect(screen.getByText("Tổng có VAT").nextElementSibling).toHaveTextContent(/507\.000/);
    expect(screen.getByText(/Chưa VAT 469\.444\s₫ · VAT 37\.556\s₫/)).toBeInTheDocument();
    // Not delivered yet: no "Đặt lại" in the header.
    expect(screen.queryByRole("link", { name: /Đặt lại đơn/ })).not.toBeInTheDocument();
  });

  it("puts 'Đặt lúc' on its own line on a phone, with no '·' left to start it", async () => {
    backend({ order: beOrder });
    renderWithProviders(<OrderDetailScreen orderId={orderId} />);

    const placed = await screen.findByText(/^\s*Đặt lúc/);
    expect(placed).toHaveTextContent(/^·?\s*Đặt lúc \d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/);
    // Its own flex item, full width below sm: it never wraps onto the order number's line.
    expect(placed.className.split(" ")).toEqual(
      expect.arrayContaining(["basis-full", "sm:basis-auto"]),
    );
    // The dot only exists from sm up, where both items share one line; it is decoration.
    const dot = placed.querySelector("[aria-hidden='true']");
    expect(dot).toHaveTextContent("·");
    expect(dot?.className.split(" ")).toEqual(expect.arrayContaining(["hidden", "sm:inline"]));
    // The order number keeps its copy button beside it.
    const number = screen.getByText(beOrder.orderNumber);
    expect(number.closest(".inline-flex")).not.toBeNull();
    expect(placed.contains(number)).toBe(false);
  });

  it("words the return window from the contract, with its last day", () => {
    expect(returnWindowText(10, "2026-11-23T03:00:00Z")).toBe(
      "Hàng nhận được bị lỗi, hỏng hoặc giao sai? Gửi yêu cầu trả hàng kèm ảnh trong 10 ngày kể từ ngày giao (đến hết 03/12/2026).",
    );
    expect(returnWindowText(7, undefined)).toMatch(/trong 7 ngày kể từ ngày giao\.$/);
  });

  it("chats with Sale about this order from the help card", () => {
    const order = orderDtoSchema.parse({
      ...beOrder,
      status: "DELIVERED",
      statusGroup: "DELIVERED",
    });
    renderWithProviders(
      <OrderHelpCard
        order={order}
        onCancel={() => {}}
        mayCancel
        requestPending={false}
        returnHref={`/account/orders/${orderId}/return`}
        windowDays={10}
      />,
    );
    expect(
      screen.getByRole("link", { name: `Chat với Sale về đơn ${beOrder.orderNumber}` }),
    ).toHaveAttribute("href", `/chat/new?kind=ORDER&id=${orderId}`);
    expect(screen.getByText(/trong 10 ngày kể từ ngày giao/)).toBeInTheDocument();
  });
});
