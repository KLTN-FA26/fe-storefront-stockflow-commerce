import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/error";
import { renderWithProviders, signIn, signOut } from "@/test/render";

import { OrderContractCard } from "../components/order-contract-card";
import { OrderReorder } from "../components/order-reorder";
import { contractDtoSchema } from "../contract-schemas";

const orderId = "0c0e0000-0000-4000-8000-000000000001";
const contractId = "c0a70000-0000-4000-8000-000000000001";

/** The customer's copy as the BE sends it: no sentBy / signedBy / creditWarning, nulls left out. */
const beContract = {
  id: contractId,
  contractNumber: "HD-20260910-900001-1",
  orderId,
  orderNumber: "SO-20260910-900001",
  status: "SENT",
  seller: { name: "Công ty TNHH StockFlow", taxCode: "0312345678" },
  buyer: { name: "Khách hàng demo" },
  freeSampleRounds: 2,
  totals: { netAmount: 70500000, taxAmount: 5640000, totalAmount: 76140000, currency: "VND" },
  deliverySchedule: [
    {
      seq: 1,
      windowStart: "2026-12-09",
      windowEnd: "2026-12-11",
      value: 37260000,
      lines: [
        {
          orderLineId: "1a2b3c4d-0000-4000-8000-000000002329",
          sku: "LY-GIAY-DEMO-12OZ-XANH",
          cartons: 30,
          units: 30000,
        },
      ],
    },
    {
      seq: 2,
      windowStart: "2026-12-23",
      windowEnd: "2026-12-23",
      value: 37260000,
      lines: [
        {
          orderLineId: "1a2b3c4d-0000-4000-8000-000000002329",
          sku: "LY-GIAY-DEMO-12OZ-XANH",
          cartons: 30,
          units: 30000,
        },
      ],
    },
  ],
  paymentPlan: [
    { seq: 1, name: "Đặt cọc khi ký", milestone: "ON_SIGNING", percent: 30, amount: 22842000 },
    {
      seq: 2,
      name: "Trước giao đợt 1",
      milestone: "BEFORE_DELIVERY",
      amount: 26649000,
      deliveryBatchSeq: 1,
    },
    {
      seq: 3,
      name: "Sau giao đợt 2",
      milestone: "AFTER_DELIVERY",
      amount: 26649000,
      dueDays: 30,
      deliveryBatchSeq: 2,
    },
  ],
  sentAt: "2026-11-17T03:00:00Z",
  returnWindowDays: 7,
  version: 3,
};

beforeEach(() => signIn());
afterEach(() => {
  vi.restoreAllMocks();
  signOut();
});

describe("OrderContractCard (WF-02 D3)", () => {
  it("parses the customer's contract with absent nulls", () => {
    const contract = contractDtoSchema.parse(beContract);
    expect(contract.signedOn).toBeUndefined();
    expect(contract.paymentPlan[2]).toMatchObject({ milestone: "AFTER_DELIVERY", dueDays: 30 });
  });

  it("shows number, status, delivery schedule, payment plan and totals", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValue({ data: beContract });
    renderWithProviders(<OrderContractCard orderId={orderId} />);

    expect(await screen.findByText("HD-20260910-900001-1")).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith(`/orders/me/${orderId}/contract`, expect.anything());
    expect(screen.getByText("Chờ bạn ký")).toBeInTheDocument();

    const schedule = screen.getByRole("list", { name: "Lịch giao" });
    expect(within(schedule).getAllByText(/^30 thùng = 30\.000 cái$/)).toHaveLength(2);
    expect(within(schedule).getAllByText(/37\.260\.000/)).toHaveLength(2);

    const plan = screen.getByRole("list", { name: "Lịch thanh toán" });
    expect(within(plan).getByText("Khi ký hợp đồng")).toBeInTheDocument();
    expect(within(plan).getByText("30%")).toBeInTheDocument();
    expect(within(plan).getByText(/22\.842\.000/)).toBeInTheDocument();
    expect(within(plan).getByText("Trước khi giao hàng · đợt giao 1")).toBeInTheDocument();
    expect(within(plan).getByText("30 ngày sau khi giao hàng · đợt giao 2")).toBeInTheDocument();

    expect(screen.getByText("Tổng có VAT").nextElementSibling).toHaveTextContent(/76\.140\.000/);
    expect(screen.getByRole("link", { name: "Chat với Sale" })).toHaveAttribute(
      "href",
      `/chat/new?kind=CONTRACT&id=${contractId}`,
    );
  });

  it("is left out while the order has no contract sent (404 SALES_CONTRACT_NOT_FOUND)", async () => {
    const get = vi
      .spyOn(api, "get")
      .mockRejectedValue(new ApiError(404, "SALES_CONTRACT_NOT_FOUND", "Chưa có hợp đồng"));
    const { container } = renderWithProviders(<OrderContractCard orderId={orderId} />);

    await waitFor(() => expect(get).toHaveBeenCalled());
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("opens the document link the BE gives in a new tab", async () => {
    vi.spyOn(api, "get").mockImplementation(async (url: string) =>
      url.endsWith("/document")
        ? {
            data: {
              url: "https://files.example/contracts/HD.pdf",
              expiresAt: "2026-11-18T10:05:00Z",
            },
          }
        : { data: { ...beContract, status: "SIGNED", signedOn: "2026-11-18" } },
    );
    const tab = { opener: {}, location: { replace: vi.fn() }, close: vi.fn() };
    vi.spyOn(window, "open").mockReturnValue(tab as unknown as Window);
    const user = userEvent.setup();
    renderWithProviders(<OrderContractCard orderId={orderId} />);

    expect(await screen.findByText("Đã ký")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Tải bản đã ký HD-20260910-900001-1" }));
    await waitFor(() =>
      expect(tab.location.replace).toHaveBeenCalledWith("https://files.example/contracts/HD.pdf"),
    );
    expect(tab.opener).toBeNull();
  });
});

describe("OrderContractCard downloads (audit item 27)", () => {
  const link = { url: "https://files.example/c.pdf", expiresAt: "2026-11-18T10:05:00Z" };
  const setup = (contract: Record<string, unknown>) => {
    const get = vi.spyOn(api, "get").mockImplementation(async (url: string) => ({
      data: url.endsWith("/document") ? link : contract,
    }));
    vi.spyOn(window, "open").mockReturnValue({
      opener: {},
      location: { replace: vi.fn() },
      close: vi.fn(),
    } as unknown as Window);
    return get;
  };
  const documentCalls = (get: ReturnType<typeof setup>) =>
    get.mock.calls.filter(([url]) => String(url).endsWith("/document"));

  it("hợp đồng đã ký có thêm nút Tải bản gửi ký gọi document?copy=sent", async () => {
    const get = setup({ ...beContract, status: "SIGNED", signedOn: "2026-11-18" });
    const user = userEvent.setup();
    renderWithProviders(<OrderContractCard orderId={orderId} />);

    await user.click(await screen.findByRole("button", { name: /Tải bản gửi ký/ }));
    await waitFor(() => expect(documentCalls(get)).toHaveLength(1));
    expect(documentCalls(get)[0]).toEqual([
      `/orders/me/${orderId}/contract/document`,
      { params: { copy: "sent" } },
    ]);

    await user.click(screen.getByRole("button", { name: /Tải bản đã ký/ }));
    await waitFor(() => expect(documentCalls(get)).toHaveLength(2));
    expect(documentCalls(get)[1]?.[0]).toBe(`/orders/me/${orderId}/contract/document`);
    expect(documentCalls(get)[1]?.[1] ?? {}).toEqual({});
  });

  it("hợp đồng chưa ký chỉ có Tải hợp đồng", async () => {
    setup(beContract);
    renderWithProviders(<OrderContractCard orderId={orderId} />);

    expect(await screen.findByRole("button", { name: /Tải hợp đồng/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Tải bản/ })).not.toBeInTheDocument();
  });
});

describe("OrderContractCard — signing and terms (SF-UX-24, SF-UX-36, L-9)", () => {
  it("guides a SENT contract in three steps, the last one sending the signed copy in its chat", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ data: beContract });
    const { container } = renderWithProviders(<OrderContractCard orderId={orderId} />);

    const steps = await screen.findByRole("list", { name: "Các bước ký hợp đồng" });
    expect(within(steps).getAllByRole("listitem")).toHaveLength(3);
    expect(within(steps).getByText("Ký, đóng dấu")).toBeInTheDocument();
    expect(within(steps).getByRole("link", { name: "Gửi bản đã ký" })).toHaveAttribute(
      "href",
      `/chat/new?kind=CONTRACT&id=${contractId}&attach=pdf`,
    );
    // Chat cards link to the section by this anchor.
    expect(container.querySelector("section#hop-dong")).not.toBeNull();
  });

  it("has no signing steps once signed", async () => {
    vi.spyOn(api, "get").mockResolvedValue({
      data: { ...beContract, status: "SIGNED", signedOn: "2026-11-18" },
    });
    renderWithProviders(<OrderContractCard orderId={orderId} />);
    expect(await screen.findByText("Đã ký")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Các bước ký hợp đồng" })).not.toBeInTheDocument();
  });

  it("shows the free sample rounds, the complaint period and what a batch's value includes", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ data: { ...beContract, returnWindowDays: 10 } });
    renderWithProviders(<OrderContractCard orderId={orderId} />);

    expect((await screen.findByText("In mẫu miễn phí")).nextElementSibling).toHaveTextContent(
      "2 lần",
    );
    expect(screen.getByText("Thời hạn khiếu nại").nextElementSibling).toHaveTextContent(
      "10 ngày sau mỗi đợt giao",
    );
    expect(
      screen.getAllByText("Giá trị hàng của đợt (gồm VAT, chưa gồm phí)").length,
    ).toBeGreaterThan(0);
  });
});

describe("OrderReorder (WF-02 D4, SF-UX-35)", () => {
  it("opens a conversation with Sales about a delivered order instead of POST /reorder", () => {
    render(
      <OrderReorder
        order={{
          orderId,
          orderNumber: "SO-20260910-900001",
          status: "DELIVERED",
          statusGroup: "DELIVERED",
        }}
      />,
    );
    expect(screen.getByRole("link", { name: /Đặt lại đơn SO-20260910-900001/ })).toHaveAttribute(
      "href",
      `/chat/new?kind=ORDER&id=${orderId}`,
    );
  });

  it("is not offered before the goods arrived", () => {
    const { container } = render(
      <OrderReorder
        order={{
          orderId,
          orderNumber: "SO-20260910-900001",
          status: "PENDING_CONTRACT",
          statusGroup: "AWAITING_CONTRACT",
        }}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
