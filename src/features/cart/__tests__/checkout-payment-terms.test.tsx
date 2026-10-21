import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/error";
import { createMockCatalog, seedMockCatalog } from "@/lib/api/mock-fixtures/catalog";
import {
  createMockOrderBook,
  MOCK_SHIPPING_ADDRESS,
  type MockCreditTerms,
  type MockOrderBook,
} from "@/lib/api/mock-fixtures/orders";
import { getPaymentTerms, paymentTermsDtoSchema } from "@/lib/payment-terms";
import { useCartStore } from "@/lib/store/use-cart-store";
import { fakeBackend } from "@/test/fake-backend";
import { renderWithProviders, resetCart, signIn, signOut } from "@/test/render";

import { resolvePaymentTerms } from "../checkout-payment-terms";
import { placeOrderInputSchema } from "../checkout-schemas";
import { CheckoutScreen } from "../components/checkout-screen";
import type { CheckoutCustomer } from "../checkout-types";

const CUSTOMER_ID = "c0ffee00-0000-4000-8000-000000000010";
const HOME = "6f1c2a3b-4d5e-4f60-8a71-0b2c3d4e5f60";

const customer: CheckoutCustomer = {
  customerId: CUSTOMER_ID,
  isLoading: false,
  error: undefined,
  onRetry: vi.fn(),
  addresses: [
    {
      addressId: HOME,
      recipientName: "Nguyễn Hoài Nam",
      phone: "0908111222",
      summary: "12 Nguyễn Huệ, Quận 1",
      isDefault: true,
    },
  ],
};

const terms = (over: Partial<MockCreditTerms> = {}): MockCreditTerms => ({
  defaultTerm: "PREPAID",
  allowed: ["PREPAID", "DEPOSIT"],
  depositPercent: 30,
  creditLimit: 0,
  creditTermDays: 30,
  ...over,
});

let book: MockOrderBook;
function setup(creditTerms: MockCreditTerms = terms()) {
  const catalog = createMockCatalog(seedMockCatalog());
  book = createMockOrderBook(CUSTOMER_ID, [], {
    catalog,
    shippingAddress: (id) => (id === HOME ? MOCK_SHIPPING_ADDRESS : undefined),
    defaultShippingAddressId: () => HOME,
    terms: creditTerms,
  });
  fakeBackend({ catalog, orders: () => book });
  // BOX-TAKEAWAY-M: 200 pieces, a 1.900.000-class cart is not needed: only the term matters here.
  useCartStore
    .getState()
    .add({ sku: "BOX-TAKEAWAY-M", slug: "box-takeaway-m", title: "Hộp mang đi M" }, 200);
}

const placeButton = () => screen.findByRole("button", { name: "Đặt hàng" });
const orderPosts = () => vi.mocked(api.post).mock.calls.filter(([url]) => url === "/orders");
const bodyOf = (index = 0) => orderPosts()[index]![1] as Record<string, unknown>;
const termGroup = () => screen.findByRole("radiogroup", { name: "Hình thức thanh toán" });

beforeEach(() => {
  resetCart();
  signIn();
  sessionStorage.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
  signOut();
  resetCart();
});

describe("checkout payment terms (kltn-docs 15 BR-01)", () => {
  it("offers exactly the terms the customer may use, with the default preselected", async () => {
    setup(terms({ allowed: ["PREPAID", "DEPOSIT"], defaultTerm: "DEPOSIT" }));
    renderWithProviders(<CheckoutScreen customer={customer} />);

    const group = await termGroup();
    expect(within(group).getAllByRole("radio")).toHaveLength(2);
    expect(within(group).getByRole("radio", { name: /Đặt cọc 30%/ })).toBeChecked();
    expect(within(group).getByRole("radio", { name: /Trả trước 100%/ })).not.toBeChecked();
    expect(within(group).queryByRole("radio", { name: /Công nợ/ })).not.toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith("/orders/payment-terms", expect.anything());
  });

  it("explains the deposit and shows the amount it comes to for this cart", async () => {
    setup(terms({ defaultTerm: "DEPOSIT" }));
    renderWithProviders(<CheckoutScreen customer={customer} />);

    await termGroup();
    expect(screen.getByText(/30% giá trị đơn\) để đơn được xác nhận/)).toBeInTheDocument();
    // BOX-TAKEAWAY-M x 200 = 30% of the subtotal, rounded to whole VND.
    expect(await screen.findByText(/Tiền cọc dự kiến/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: /Trả trước 100%/ }));
    expect(screen.queryByText(/Tiền cọc dự kiến/)).not.toBeInTheDocument();
    expect(screen.getByText(/Đơn được xác nhận khi chúng tôi đã nhận đủ tiền/)).toBeInTheDocument();
  });

  it("sends the term the customer picked in POST /orders, and never a deposit share", async () => {
    setup(terms({ defaultTerm: "PREPAID" }));
    renderWithProviders(<CheckoutScreen customer={customer} />);
    await userEvent.click(await screen.findByRole("radio", { name: /Đặt cọc 30%/ }));
    await userEvent.click(await placeButton());

    expect(await screen.findByRole("heading", { name: "Đã đặt hàng" })).toBeInTheDocument();
    expect(bodyOf()).toMatchObject({ paymentTerm: "DEPOSIT" });
    expect(bodyOf()).not.toHaveProperty("depositPercent");
  });

  it("omits the term when it is the customer's default, picked or not: the BE applies it itself", async () => {
    setup(terms({ defaultTerm: "DEPOSIT" }));
    renderWithProviders(<CheckoutScreen customer={customer} />);
    await userEvent.click(await placeButton());
    await screen.findByRole("heading", { name: "Đã đặt hàng" });
    expect(bodyOf()).not.toHaveProperty("paymentTerm");
    expect((await screen.findAllByText(/Đã đặt hàng/)).length).toBeGreaterThan(0);
  });

  it("omits it too when the customer picks the default explicitly", async () => {
    setup(terms({ defaultTerm: "PREPAID" }));
    renderWithProviders(<CheckoutScreen customer={customer} />);
    await userEvent.click(await screen.findByRole("radio", { name: /Đặt cọc 30%/ }));
    await userEvent.click(screen.getByRole("radio", { name: /Trả trước 100%/ }));
    await userEvent.click(await placeButton());
    await screen.findByRole("heading", { name: "Đã đặt hàng" });
    expect(bodyOf()).not.toHaveProperty("paymentTerm");
  });

  it("shows no choice when only one term is allowed, and still orders on it", async () => {
    setup(terms({ allowed: ["PREPAID"], defaultTerm: "PREPAID" }));
    renderWithProviders(<CheckoutScreen customer={customer} />);

    expect(await screen.findByText("Trả trước 100%")).toBeInTheDocument();
    expect(
      screen.queryByRole("radiogroup", { name: "Hình thức thanh toán" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: /Trả trước/ })).not.toBeInTheDocument();
    await userEvent.click(await placeButton());
    await screen.findByRole("heading", { name: "Đã đặt hàng" });
    expect(bodyOf()).not.toHaveProperty("paymentTerm"); // the only term is the default
  });

  it("offers credit as a term, and says nothing about the credit until it is picked", async () => {
    setup(terms({ allowed: ["PREPAID", "CREDIT"], creditLimit: 987_654_321 }));
    renderWithProviders(<CheckoutScreen customer={customer} />);

    const group = await termGroup();
    expect(within(group).getByRole("radio", { name: /Công nợ/ })).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/987/);
    expect(screen.queryByText(/Hạn mức công nợ còn lại/)).not.toBeInTheDocument();
  });

  describe("credit left, against the order total (SFCREDIT)", () => {
    const credit = (over: Partial<MockCreditTerms> = {}) =>
      terms({ allowed: ["PREPAID", "CREDIT"], creditLimit: 50_000_000, ...over });
    const pickCredit = async () =>
      userEvent.click(await screen.findByRole("radio", { name: /Công nợ/ }));

    it("shows what is left of the limit and what stays after this order, with the days to pay", async () => {
      setup(credit({ exposure: 10_000_000, creditTermDays: 45 }));
      renderWithProviders(<CheckoutScreen customer={customer} />);
      await pickCredit();

      const note = await screen.findByText(/Hạn mức công nợ còn lại/);
      expect(note).toHaveTextContent(/40\.000\.000/);
      expect(note).toHaveTextContent(/thanh toán trong 45 ngày kể từ khi giao hàng/);
      expect(screen.queryByText("Đơn vượt hạn mức công nợ còn lại.")).not.toBeInTheDocument();
    });

    it("tells the customer an order above what is left will be held, and still lets them order", async () => {
      setup(credit({ creditLimit: 1_000_000, exposure: 900_000 }));
      renderWithProviders(<CheckoutScreen customer={customer} />);
      await pickCredit();

      const warning = await screen.findByText("Đơn vượt hạn mức công nợ còn lại.");
      expect(warning.closest("div")).toHaveTextContent(/100\.000/);
      expect(warning.closest("div")).toHaveTextContent(/duyệt công nợ/);
      expect(await placeButton()).toBeEnabled();
      await userEvent.click(await placeButton());
      expect(
        await screen.findByRole("heading", { name: "Đã nhận đơn, đang chờ duyệt công nợ" }),
      ).toBeInTheDocument();
    });

    it("warns about an overdue receivable even when the limit would cover the order", async () => {
      setup(credit({ overdue: true }));
      renderWithProviders(<CheckoutScreen customer={customer} />);
      await pickCredit();

      expect(
        await screen.findByText("Tài khoản đang có khoản công nợ quá hạn."),
      ).toBeInTheDocument();
      expect(await placeButton()).toBeEnabled();
    });

    it("says nothing about credit for another term", async () => {
      setup(credit({ defaultTerm: "PREPAID" }));
      renderWithProviders(<CheckoutScreen customer={customer} />);
      await termGroup();
      expect(screen.queryByText(/Hạn mức công nợ còn lại/)).not.toBeInTheDocument();
      expect(screen.queryByText("Đơn vượt hạn mức công nợ còn lại.")).not.toBeInTheDocument();
    });
  });

  it("uses a new request id when the term changes (the same key with another term would be refused)", async () => {
    setup();
    renderWithProviders(<CheckoutScreen customer={customer} />);
    const button = await placeButton();
    await waitFor(() => expect(button).toBeEnabled());
    vi.mocked(api.post)
      .mockRejectedValueOnce(new ApiError(0, "NETWORK_ERROR", "timeout"))
      .mockRejectedValueOnce(new ApiError(0, "NETWORK_ERROR", "timeout"));
    await userEvent.click(button);
    await screen.findByRole("alert");
    await userEvent.click(screen.getByRole("button", { name: "Đặt hàng" })); // same order: same key
    await waitFor(() => expect(orderPosts()).toHaveLength(2));
    await userEvent.click(await screen.findByRole("radio", { name: /Đặt cọc 30%/ }));
    await userEvent.click(screen.getByRole("button", { name: "Đặt hàng" }));
    await screen.findByRole("heading", { name: "Đã đặt hàng" });

    expect(bodyOf(1).requestId).toBe(bodyOf(0).requestId);
    expect(bodyOf(2).requestId).not.toBe(bodyOf(0).requestId);
    expect(bodyOf(2)).toMatchObject({ paymentTerm: "DEPOSIT" });
  });

  it("explains PAYMENT_TERM_NOT_ALLOWED and re-reads the terms", async () => {
    setup();
    renderWithProviders(<CheckoutScreen customer={customer} />);
    const button = await placeButton();
    await waitFor(() => expect(button).toBeEnabled());
    vi.mocked(api.post).mockRejectedValueOnce(
      new ApiError(409, "PAYMENT_TERM_NOT_ALLOWED", "not allowed", undefined, "corr-9"),
    );
    const readsBefore = vi
      .mocked(api.get)
      .mock.calls.filter(([url]) => url === "/orders/payment-terms").length;
    await userEvent.click(button);

    expect(await screen.findByRole("alert")).toHaveTextContent(/Điều khoản thanh toán.*Sales/);
    await waitFor(() =>
      expect(
        vi.mocked(api.get).mock.calls.filter(([url]) => url === "/orders/payment-terms").length,
      ).toBeGreaterThan(readsBefore),
    );
  });

  it("waits for the terms before enabling the order, so the first order is never on a guess", async () => {
    setup();
    let release: (value: unknown) => void = () => undefined;
    const real = vi.mocked(api.get).getMockImplementation()!;
    vi.mocked(api.get).mockImplementation(async (url, config) =>
      url === "/orders/payment-terms"
        ? await new Promise((resolve) => (release = resolve))
        : real(url, config),
    );
    renderWithProviders(<CheckoutScreen customer={customer} />);

    expect(await placeButton()).toBeDisabled();
    release({ data: { allowedTerms: ["PREPAID"], defaultTerm: "PREPAID" } });
    await waitFor(() => expect(screen.getByRole("button", { name: "Đặt hàng" })).toBeEnabled());
  });

  it("still lets the customer order, on the account's default term, when the terms cannot be read", async () => {
    setup();
    const real = vi.mocked(api.get).getMockImplementation()!;
    vi.mocked(api.get).mockImplementation(async (url, config) => {
      if (url === "/orders/payment-terms") {
        throw new ApiError(404, "CUSTOMER_NOT_FOUND", "no profile", undefined, "corr-7");
      }
      return real(url, config);
    });
    renderWithProviders(<CheckoutScreen customer={customer} />);

    expect(await screen.findByText(/Không tải được điều khoản thanh toán/)).toBeInTheDocument();
    expect(screen.getByText(/điều khoản mặc định của tài khoản/)).toBeInTheDocument();
    await userEvent.click(await placeButton());
    await screen.findByRole("heading", { name: "Đã đặt hàng" });
    expect(bodyOf()).not.toHaveProperty("paymentTerm"); // the BE applies the default itself
  });
});

describe("payment term and the idempotency key", () => {
  it("keeps the same request id after a timeout and a reload when a non-default term was picked", async () => {
    setup(terms({ defaultTerm: "PREPAID" }));
    const first = renderWithProviders(<CheckoutScreen customer={customer} />);
    await userEvent.click(await screen.findByRole("radio", { name: /Đặt cọc 30%/ }));
    const button = await placeButton();
    await waitFor(() => expect(button).toBeEnabled());
    vi.mocked(api.post).mockRejectedValueOnce(new ApiError(0, "NETWORK_ERROR", "timeout"));
    await userEvent.click(button);
    await screen.findByRole("alert");
    first.unmount(); // reload: new component, same sessionStorage; the pick is not in memory any more

    renderWithProviders(<CheckoutScreen customer={customer} />);
    const again = await placeButton();
    await waitFor(() => expect(again).toBeEnabled());
    expect(await screen.findByRole("radio", { name: /Đặt cọc 30%/ })).toBeChecked();
    await userEvent.click(again);
    await screen.findByRole("heading", { name: "Đã đặt hàng" });

    expect(orderPosts()).toHaveLength(2);
    expect(bodyOf(1).requestId).toBe(bodyOf(0).requestId);
    expect(bodyOf(1)).toMatchObject({ paymentTerm: "DEPOSIT" });
  });

  it("forgets the pick once the order is placed: the next order starts from the default", async () => {
    setup(terms({ defaultTerm: "PREPAID" }));
    const first = renderWithProviders(<CheckoutScreen customer={customer} />);
    await userEvent.click(await screen.findByRole("radio", { name: /Đặt cọc 30%/ }));
    await userEvent.click(await placeButton());
    await screen.findByRole("heading", { name: "Đã đặt hàng" });
    expect(sessionStorage.getItem("stockflow:storefront:checkout-request")).toBeNull();
    first.unmount();

    resetCart();
    setup(terms({ defaultTerm: "PREPAID" }));
    renderWithProviders(<CheckoutScreen customer={customer} />);
    expect(await screen.findByRole("radio", { name: /Trả trước 100%/ })).toBeChecked();
  });

  it("does not order after a reload while the terms cannot be read, so an earlier pick is not swapped for the default", async () => {
    setup(terms({ defaultTerm: "PREPAID" }));
    const first = renderWithProviders(<CheckoutScreen customer={customer} />);
    await userEvent.click(await screen.findByRole("radio", { name: /Đặt cọc 30%/ }));
    first.unmount();

    const real = vi.mocked(api.get).getMockImplementation()!;
    vi.mocked(api.get).mockImplementation(async (url, config) => {
      if (url === "/orders/payment-terms") throw new ApiError(404, "CUSTOMER_NOT_FOUND", "x");
      return real(url, config);
    });
    renderWithProviders(<CheckoutScreen customer={customer} />);

    expect(await screen.findByText(/theo hình thức bạn đã chọn trước đó/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Đặt hàng" })).toBeDisabled();
    expect(orderPosts()).toHaveLength(0);
  });

  it("keeps showing and sending the terms already read when a refetch fails (no contradicting notice)", async () => {
    setup(terms({ defaultTerm: "PREPAID" }));
    const { client } = renderWithProviders(<CheckoutScreen customer={customer} />);
    await userEvent.click(await screen.findByRole("radio", { name: /Đặt cọc 30%/ }));
    const real = vi.mocked(api.get).getMockImplementation()!;
    vi.mocked(api.get).mockImplementation(async (url, config) => {
      if (url === "/orders/payment-terms") throw new ApiError(404, "CUSTOMER_NOT_FOUND", "x");
      return real(url, config);
    });
    await client.refetchQueries({ queryKey: ["payment-terms"] });
    await waitFor(() => expect(client.getQueryState(["payment-terms"])?.status).toBe("error"));

    // the choice is still there, and no notice says the order would use the account default
    expect(screen.getByRole("radio", { name: /Đặt cọc 30%/ })).toBeChecked();
    expect(screen.queryByText(/điều khoản mặc định của tài khoản/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Đặt hàng" }));
    await screen.findByRole("heading", { name: "Đã đặt hàng" });
    expect(bodyOf()).toMatchObject({ paymentTerm: "DEPOSIT" });
  });
});

describe("payment terms boundary", () => {
  it("keeps the customer's own credit position and drops what it does not read", () => {
    const dto = paymentTermsDtoSchema.parse({
      customerId: CUSTOMER_ID,
      allowedTerms: ["PREPAID", "CREDIT"],
      defaultTerm: "CREDIT",
      creditLimit: 50_000_000,
      creditTermDays: 45,
      exposure: 12_000_000,
      availableCredit: 38_000_000,
      currency: "VND",
      hasOverdue: true,
    });
    expect(dto).toEqual({
      allowedTerms: ["PREPAID", "CREDIT"],
      defaultTerm: "CREDIT",
      creditLimit: 50_000_000,
      creditTermDays: 45,
      exposure: 12_000_000,
      availableCredit: 38_000_000,
      currency: "VND",
      hasOverdue: true,
    });
    // A customer without credit: the BE omits the credit fields (NON_NULL).
    expect(paymentTermsDtoSchema.parse({ allowedTerms: ["PREPAID"] })).toEqual({
      allowedTerms: ["PREPAID"],
    });
  });

  it("drops a term newer than the FE, falls back to the first allowed one, and keeps the BE order", () => {
    const choice = resolvePaymentTerms({
      allowedTerms: ["INSTALMENT", "CREDIT", "PREPAID"],
      defaultTerm: "INSTALMENT",
    });
    expect(choice?.options.map((o) => o.term)).toEqual(["PREPAID", "CREDIT"]);
    expect(choice?.defaultTerm).toBe("PREPAID");
    expect(resolvePaymentTerms({ allowedTerms: ["INSTALMENT"] })).toBeUndefined();
    expect(resolvePaymentTerms({ allowedTerms: [] })).toBeUndefined();
  });

  it("falls back when the default is not among the allowed terms", () => {
    expect(
      resolvePaymentTerms({ allowedTerms: ["PREPAID", "DEPOSIT"], defaultTerm: "CREDIT" })
        ?.defaultTerm,
    ).toBe("PREPAID");
  });

  it("refuses a deposit share outside 0..100 and accepts an absent one", () => {
    expect(
      paymentTermsDtoSchema.safeParse({ allowedTerms: ["DEPOSIT"], depositPercent: 0 }).success,
    ).toBe(false);
    expect(
      paymentTermsDtoSchema.safeParse({ allowedTerms: ["DEPOSIT"], depositPercent: 100 }).success,
    ).toBe(false);
    expect(paymentTermsDtoSchema.safeParse({ allowedTerms: ["PREPAID"] }).success).toBe(true);
  });

  it("accepts only the BE's terms in the order request, and no deposit share", () => {
    const base = {
      requestId: "3f9c1a52-7b1e-4c3d-9a55-0d6f2b7e8a10",
      customerId: CUSTOMER_ID,
      shippingAddressId: HOME,
      lines: [{ sku: "BOX-TAKEAWAY-M", quantity: 1, unitPrice: 1 }],
    };
    expect(placeOrderInputSchema.safeParse({ ...base, paymentTerm: "DEPOSIT" }).success).toBe(true);
    expect(placeOrderInputSchema.safeParse({ ...base, paymentTerm: "BARTER" }).success).toBe(false);
    expect(placeOrderInputSchema.parse({ ...base, depositPercent: 5 })).not.toHaveProperty(
      "depositPercent",
    );
  });

  it("reads GET /orders/payment-terms through the api client", async () => {
    vi.spyOn(api, "get").mockResolvedValue({
      data: { allowedTerms: ["PREPAID"], defaultTerm: "PREPAID" },
    });
    await expect(getPaymentTerms()).resolves.toEqual({
      allowedTerms: ["PREPAID"],
      defaultTerm: "PREPAID",
    });
    expect(api.get).toHaveBeenCalledWith("/orders/payment-terms", {});
  });
});
