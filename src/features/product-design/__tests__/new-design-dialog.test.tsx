import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/error";
import {
  MOCK_BLOCKED_SKU,
  MOCK_SKU_WITHOUT_PRINT_CONFIG,
} from "@/lib/api/mock-fixtures/design-print-configs";
import { renderWithProviders } from "@/test/render";

import { NewDesignDialog, type DesignableCatalogue } from "../components/new-design-dialog";
import { designBackend } from "./design-backend";

const env = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: env.push }) }));

beforeEach(async () => {
  env.push.mockReset();
  await designBackend();
});
afterEach(() => vi.restoreAllMocks());

// The mock adapter adds latency per request, and a product's variants are each checked.
const WAIT = { timeout: 4000 };

const products = [
  { slug: "ly-giay-2-lop-12oz", title: "Ly giấy 2 lớp 12oz", skus: ["CUP-PAPER-12OZ-WHT"] },
  {
    slug: "tui-giay-kraft",
    title: "Túi giấy kraft quai xoắn",
    skus: ["BAG-KRAFT-M", MOCK_SKU_WITHOUT_PRINT_CONFIG],
  },
  { slug: "ly-giay-kraft-16oz", title: "Ly giấy kraft 16oz", skus: [MOCK_BLOCKED_SKU] },
];

const open = (catalogue: DesignableCatalogue = { status: "ready", products }) =>
  renderWithProviders(<NewDesignDialog catalogue={catalogue} open onOpenChange={vi.fn()} />);

const pickProduct = (name: string) => userEvent.click(screen.getByRole("button", { name }));
const variant = (sku: string) => screen.getByRole("radio", { name: sku });

describe("NewDesignDialog", () => {
  it("asks for a product, then a variant by SKU, and starts on a variant that takes designs", async () => {
    open();
    const start = screen.getByRole("button", { name: "Bắt đầu" });
    expect(start).toBeDisabled();

    await pickProduct("Túi giấy kraft quai xoắn");
    await waitFor(() => expect(variant("BAG-KRAFT-M")).toBeEnabled(), WAIT);
    await userEvent.click(variant("BAG-KRAFT-M"));
    await waitFor(() => expect(start).toBeEnabled());

    await userEvent.click(start);
    expect(env.push).toHaveBeenCalledWith("/design/new?product=tui-giay-kraft&sku=BAG-KRAFT-M");
  });

  it("disables a variant without a print configuration, and says why (spec §6.3)", async () => {
    open();
    await pickProduct("Túi giấy kraft quai xoắn");

    await waitFor(() => expect(variant("BAG-KRAFT-M")).toBeEnabled(), WAIT);
    expect(variant(MOCK_SKU_WITHOUT_PRINT_CONFIG)).toBeDisabled();
    expect(variant(MOCK_SKU_WITHOUT_PRINT_CONFIG)).toHaveAccessibleDescription(
      "Chưa nhận thiết kế",
    );
    expect(screen.getByRole("button", { name: "Bắt đầu" })).toBeDisabled();
  });

  it("disables a variant that takes designs no more", async () => {
    open();
    await pickProduct("Ly giấy kraft 16oz");

    await waitFor(
      () =>
        expect(variant(MOCK_BLOCKED_SKU)).toHaveAccessibleDescription("Không còn nhận thiết kế"),
      WAIT,
    );
    expect(variant(MOCK_BLOCKED_SKU)).toBeDisabled();
  });

  it("says a variant whose check failed, and checks it again on Thử lại", async () => {
    const { get } = await designBackend();
    // A refusal is not retried by itself (a 5xx would be): the customer's Thử lại reads it again.
    get.mockRejectedValueOnce(new ApiError(403, "FORBIDDEN", "x"));
    open();
    await pickProduct("Ly giấy 2 lớp 12oz");

    expect(await screen.findByText("Chưa kiểm tra được", undefined, WAIT)).toBeInTheDocument();
    expect(variant("CUP-PAPER-12OZ-WHT")).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    await waitFor(() => expect(variant("CUP-PAPER-12OZ-WHT")).toBeEnabled(), WAIT);
  });

  it("filters the products by what the customer types", async () => {
    open();
    await userEvent.type(screen.getByRole("searchbox", { name: "Tìm sản phẩm" }), "ly giấy 2");

    expect(screen.getByRole("button", { name: "Ly giấy 2 lớp 12oz" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Túi giấy kraft quai xoắn" }),
    ).not.toBeInTheDocument();
  });

  it("says when no product matches", async () => {
    open();
    await userEvent.type(screen.getByRole("searchbox", { name: "Tìm sản phẩm" }), "bình giữ nhiệt");

    expect(screen.getByText("Không tìm thấy sản phẩm phù hợp.")).toBeInTheDocument();
  });
});

describe("NewDesignDialog while the catalogue is not there", () => {
  it("shows the catalogue loading, never 'no match'", () => {
    open({ status: "loading" });

    expect(screen.getByRole("status", { name: "Đang tải danh sách sản phẩm" })).toBeInTheDocument();
    expect(screen.queryByText("Không tìm thấy sản phẩm phù hợp.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bắt đầu" })).toBeDisabled();
  });

  it("says the catalogue failed, and retries it on request", async () => {
    const onRetry = vi.fn();
    open({
      status: "error",
      error: new ApiError(503, "UNAVAILABLE", "down"),
      onRetry,
      retrying: false,
    });

    expect(screen.getByText("Không tải được danh sách sản phẩm")).toBeInTheDocument();
    expect(screen.queryByText("Không tìm thấy sản phẩm phù hợp.")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
