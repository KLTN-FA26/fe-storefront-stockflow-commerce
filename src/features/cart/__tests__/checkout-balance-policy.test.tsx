import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/error";
import { createMockCatalog, seedMockCatalog } from "@/lib/api/mock-fixtures/catalog";
import { useCartStore } from "@/lib/store/use-cart-store";
import { fakeBackend } from "@/test/fake-backend";
import { renderWithProviders, resetCart, signIn, signOut } from "@/test/render";

import { describeCheckoutError, isCreditRefusal } from "../checkout-errors";
import { resolvePaymentTerms } from "../checkout-payment-terms";
import { placeOrderInputSchema } from "../checkout-schemas";
import { CheckoutScreen } from "../components/checkout-screen";
import type { CheckoutCustomer } from "../checkout-types";

const CUSTOMER_ID = "c0ffee00-0000-4000-8000-000000000010";
const HOME = "6f1c2a3b-4d5e-4f60-8a71-0b2c3d4e5f60";
const ORDER_ID = "7c1f6f0e-3c36-4e0e-9a43-2b0f0d6a1c11";

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

const termsBody = (over: Record<string, unknown> = {}) => ({
  allowedTerms: ["PREPAID", "DEPOSIT"],
  defaultTerm: "DEPOSIT",
  depositPercent: 30,
  depositBalancePolicy: "ON_CREDIT",
  allowedBalancePolicies: ["BEFORE_DELIVERY", "ON_DELIVERY", "ON_CREDIT"],
  creditLimit: 1_000_000,
  exposure: 0,
  availableCredit: 1_000_000,
  currency: "VND",
  hasOverdue: false,
  overdueAmount: 0,
  ...over,
});

function setup(terms: Record<string, unknown> = termsBody()) {
  const catalog = createMockCatalog(seedMockCatalog());
  fakeBackend({
    catalog,
    others: (url) => (url === "/orders/payment-terms" ? { data: terms } : undefined),
  });
  vi.mocked(api.post).mockResolvedValue({
    data: {
      orderId: ORDER_ID,
      orderNumber: "SO-20261023-000007",
      status: "PENDING_PAYMENT",
      totalAmount: 1,
      currency: "VND",
      paymentTerm: "DEPOSIT",
    },
  });
  useCartStore
    .getState()
    .add({ sku: "BOX-TAKEAWAY-M", slug: "box-takeaway-m", title: "Hộp mang đi M" }, 200);
}

const placeButton = () => screen.findByRole("button", { name: "Đặt hàng" });
const orderPosts = () => vi.mocked(api.post).mock.calls.filter(([url]) => url === "/orders");
const bodyOf = (index = 0) => orderPosts()[index]![1] as Record<string, unknown>;
const balanceGroup = () => screen.findByRole("radiogroup", { name: "Thanh toán phần còn lại" });

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

describe("balance policy options", () => {
  const dto = (over: Record<string, unknown> = {}) =>
    termsBody(over) as Parameters<typeof resolvePaymentTerms>[0];

  it("offers exactly the allowed policies in the BE's order, with the customer's own as default", () => {
    const choice = resolvePaymentTerms(
      dto({ allowedBalancePolicies: ["ON_CREDIT", "BEFORE_DELIVERY"] }),
    )?.balance;
    expect(choice?.options.map((o) => o.policy)).toEqual(["BEFORE_DELIVERY", "ON_CREDIT"]);
    expect(choice?.defaultPolicy).toBe("ON_CREDIT");
  });

  it("has no default when the customer's own policy is not allowed, and drops unknown policies", () => {
    const choice = resolvePaymentTerms(
      dto({
        depositBalancePolicy: "ON_DELIVERY",
        allowedBalancePolicies: ["BEFORE_DELIVERY", "ON_CREDIT", "SOMETHING_NEW"],
      }),
    )?.balance;
    expect(choice?.options).toHaveLength(2);
    expect(choice?.defaultPolicy).toBeUndefined();
  });

  it("offers no choice when deposits are not allowed or fewer than two policies are", () => {
    expect(resolvePaymentTerms(dto({ allowedTerms: ["PREPAID"] }))?.balance).toBeUndefined();
    expect(
      resolvePaymentTerms(dto({ allowedBalancePolicies: ["BEFORE_DELIVERY"] }))?.balance,
    ).toBeUndefined();
    expect(resolvePaymentTerms(dto({ allowedBalancePolicies: [] }))?.balance).toBeUndefined();
    expect(
      resolvePaymentTerms(dto({ allowedBalancePolicies: undefined }))?.balance,
    ).toBeUndefined();
  });

  it("accepts a balance policy in the order request, only one of the BE's", () => {
    const base = {
      requestId: crypto.randomUUID(),
      customerId: CUSTOMER_ID,
      shippingAddressId: HOME,
      lines: [{ sku: "BOX-TAKEAWAY-M", quantity: 1, unitPrice: 1000 }],
    };
    expect(
      placeOrderInputSchema.safeParse({ ...base, balancePolicy: "BEFORE_DELIVERY" }).success,
    ).toBe(true);
    expect(placeOrderInputSchema.safeParse({ ...base, balancePolicy: "NEVER" }).success).toBe(
      false,
    );
  });
});

describe("balance policy at checkout", () => {
  it("shows a radio group of the allowed policies for a DEPOSIT order, the customer's own preselected", async () => {
    setup();
    renderWithProviders(<CheckoutScreen customer={customer} />);

    const group = await balanceGroup();
    expect(within(group).getAllByRole("radio")).toHaveLength(3);
    expect(within(group).getByRole("radio", { name: /Ghi vào công nợ/ })).toBeChecked();
    expect(within(group).getByRole("radio", { name: /Trả trước khi giao/ })).not.toBeChecked();
    expect(within(group).getByText(/Thanh toán phần còn lại cho đơn vị vận chuyển/)).toBeVisible();
  });

  it("limits the group to the allowed policies", async () => {
    setup(termsBody({ allowedBalancePolicies: ["BEFORE_DELIVERY", "ON_CREDIT"] }));
    renderWithProviders(<CheckoutScreen customer={customer} />);

    const group = await balanceGroup();
    expect(within(group).getAllByRole("radio")).toHaveLength(2);
    expect(within(group).queryByRole("radio", { name: /Trả khi nhận hàng/ })).toBeNull();
  });

  it("shows no balance choice for another term, nor when deposits are not allowed", async () => {
    setup(termsBody({ defaultTerm: "PREPAID" }));
    renderWithProviders(<CheckoutScreen customer={customer} />);
    await screen.findByRole("radiogroup", { name: "Hình thức thanh toán" });
    expect(screen.queryByRole("radiogroup", { name: "Thanh toán phần còn lại" })).toBeNull();
    await userEvent.click(screen.getByRole("radio", { name: /Đặt cọc 30%/ }));
    expect(await balanceGroup()).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: /Trả trước 100%/ }));
    expect(screen.queryByRole("radiogroup", { name: "Thanh toán phần còn lại" })).toBeNull();
  });

  it("omits balancePolicy when it is the customer's own, and sends the one picked otherwise", async () => {
    setup();
    renderWithProviders(<CheckoutScreen customer={customer} />);
    await userEvent.click(await placeButton());
    await screen.findByRole("heading", { name: "Đã đặt hàng" });
    expect(bodyOf()).not.toHaveProperty("balancePolicy");
  });

  it("sends the picked policy in POST /orders and never on a non-deposit term", async () => {
    setup();
    renderWithProviders(<CheckoutScreen customer={customer} />);
    await userEvent.click(await screen.findByRole("radio", { name: /Trả trước khi giao/ }));
    await userEvent.click(await placeButton());
    await screen.findByRole("heading", { name: "Đã đặt hàng" });
    expect(bodyOf()).toMatchObject({ balancePolicy: "BEFORE_DELIVERY" });
    expect(bodyOf()).not.toHaveProperty("paymentTerm");
  });

  it("does not send a balance policy when another term is chosen", async () => {
    setup();
    renderWithProviders(<CheckoutScreen customer={customer} />);
    await userEvent.click(await screen.findByRole("radio", { name: /Trả trước khi giao/ }));
    await userEvent.click(screen.getByRole("radio", { name: /Trả trước 100%/ }));
    await userEvent.click(await placeButton());
    await screen.findByRole("heading", { name: "Đã đặt hàng" });
    expect(bodyOf()).toMatchObject({ paymentTerm: "PREPAID" });
    expect(bodyOf()).not.toHaveProperty("balancePolicy");
  });

  it("uses a new request id when the balance policy changes", async () => {
    setup();
    renderWithProviders(<CheckoutScreen customer={customer} />);
    vi.mocked(api.post).mockRejectedValueOnce(new ApiError(503, "LOCK_TIMEOUT", "busy"));
    await userEvent.click(await placeButton());
    await screen.findByRole("alert");
    await userEvent.click(screen.getByRole("radio", { name: /Trả trước khi giao/ }));
    await userEvent.click(await placeButton());
    await waitFor(() => expect(orderPosts()).toHaveLength(2));
    expect(bodyOf(0).requestId).not.toBe(bodyOf(1).requestId);
  });

  it("warns beside the credit option when the balance does not fit on credit", async () => {
    // BOX-TAKEAWAY-M x 200: the balance is far above 100.000 left.
    setup(termsBody({ creditLimit: 100_000, availableCredit: 100_000 }));
    renderWithProviders(<CheckoutScreen customer={customer} />);

    const warning = await screen.findByText("Phần còn lại vượt hạn mức công nợ còn lại.");
    expect(warning.closest("div")).toHaveTextContent(/100\.000/);
    expect(warning.closest("div")).toHaveTextContent(/Trả trước khi giao/);
  });

  it("shows the overdue amount in the credit note", async () => {
    setup(
      termsBody({ hasOverdue: true, overdueAmount: 1_300_000, oldestOverdueDueDate: "2026-10-13" }),
    );
    renderWithProviders(<CheckoutScreen customer={customer} />);

    const warning = await screen.findByText("Tài khoản đang có khoản công nợ quá hạn.");
    expect(warning.closest("div")).toHaveTextContent(/1\.300\.000/);
    expect(warning.closest("div")).toHaveTextContent(/13\/10\/2026|13 thg 10, 2026/);
  });
});

describe("credit refusals from POST /orders", () => {
  const exceeded = new ApiError(
    409,
    "BALANCE_CREDIT_LIMIT_EXCEEDED",
    "english text",
    undefined,
    undefined,
    {
      availableCredit: 100_000,
      creditLimit: 1_000_000,
      exposure: 900_000,
      requiredAmount: 600_000,
      currency: "VND",
    },
  );
  const overdue = new ApiError(
    409,
    "CUSTOMER_CREDIT_OVERDUE",
    "english text",
    undefined,
    undefined,
    {
      availableCredit: 100_000,
      overdueAmount: 1_300_000,
      oldestOverdueDueDate: "2026-10-13",
      currency: "VND",
    },
  );

  it("quotes the credit left and the amount needed, and points at Trả trước khi giao", () => {
    const text = describeCheckoutError(exceeded, { prepayOffered: true });
    expect(text).toMatch(/600\.000/);
    expect(text).toMatch(/100\.000/);
    expect(text).toMatch(/hạn mức 1\.000\.000/);
    expect(text).toContain("Trả trước khi giao");
    expect(text).not.toContain("english text");
  });

  it("does not point at Trả trước khi giao when it is not offered", () => {
    expect(describeCheckoutError(exceeded, { prepayOffered: false })).not.toContain(
      "Trả trước khi giao",
    );
  });

  it("quotes the overdue amount and the oldest due date", () => {
    const text = describeCheckoutError(overdue, { prepayOffered: true });
    expect(text).toMatch(/1\.300\.000/);
    expect(text).toMatch(/quá hạn/);
    expect(text).toMatch(/2026/);
  });

  it("falls back to the static text when the details are missing or malformed", () => {
    const bare = new ApiError(409, "BALANCE_CREDIT_LIMIT_EXCEEDED", "x");
    expect(describeCheckoutError(bare)).toMatch(/vượt hạn mức công nợ còn lại/);
    const bad = new ApiError(409, "CUSTOMER_CREDIT_OVERDUE", "x", undefined, undefined, {
      overdueAmount: "lots",
    });
    expect(describeCheckoutError(bad)).toMatch(/công nợ quá hạn/);
  });

  it("maps the other new codes to Vietnamese and never shows the BE text", () => {
    const text = describeCheckoutError(new ApiError(409, "BALANCE_POLICY_NOT_ALLOWED", "english"));
    expect(text).toMatch(/phần còn lại/);
    expect(text).not.toContain("english");
    expect(isCreditRefusal(exceeded)).toBe(true);
    expect(isCreditRefusal(new ApiError(409, "BALANCE_POLICY_NOT_ALLOWED", "x"))).toBe(false);
  });

  it("shows the numbers on screen, pre-selects Trả trước khi giao, and re-reads the terms", async () => {
    setup();
    renderWithProviders(<CheckoutScreen customer={customer} />);
    const button = await placeButton();
    await waitFor(() => expect(button).toBeEnabled());
    vi.mocked(api.post).mockRejectedValueOnce(exceeded);
    const reads = () =>
      vi.mocked(api.get).mock.calls.filter(([url]) => url === "/orders/payment-terms").length;
    const before = reads();
    await userEvent.click(button);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/600\.000/);
    expect(alert).toHaveTextContent(/100\.000/);
    expect(alert).toHaveTextContent(/chọn sẵn “Trả trước khi giao”/);
    expect(screen.getByRole("radio", { name: /Trả trước khi giao/ })).toBeChecked();
    await waitFor(() => expect(reads()).toBeGreaterThan(before));

    // One tap on "Đặt hàng" retries with the way out.
    await userEvent.click(await placeButton());
    await screen.findByRole("heading", { name: "Đã đặt hàng" });
    expect(bodyOf(1)).toMatchObject({ balancePolicy: "BEFORE_DELIVERY" });
  });
});
