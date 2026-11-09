import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MOCK_SKU_WITHOUT_PRINT_CONFIG } from "@/lib/api/mock-fixtures/design-print-configs";
import { renderWithProviders } from "@/test/render";

import { NewDesignDialog } from "../components/new-design-dialog";
import { designBackend } from "./design-backend";

const env = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: env.push }) }));

beforeEach(async () => {
  env.push.mockReset();
  await designBackend();
});
afterEach(() => vi.restoreAllMocks());

const products = [
  {
    slug: "ly-giay-2-lop-12oz",
    title: "Ly giấy 2 lớp 12oz",
    variants: [{ sku: "CUP-PAPER-12OZ-WHT", label: "Trắng 12oz" }],
  },
  {
    slug: "tui-giay-kraft",
    title: "Túi giấy kraft quai xoắn",
    variants: [
      { sku: "BAG-KRAFT-M", label: "Cỡ M" },
      { sku: MOCK_SKU_WITHOUT_PRINT_CONFIG, label: "Cỡ L" },
    ],
  },
];

const open = () =>
  renderWithProviders(<NewDesignDialog products={products} open onOpenChange={vi.fn()} />);

describe("NewDesignDialog", () => {
  it("asks for a product, then a variant, and starts only on a variant that takes designs", async () => {
    open();
    const start = screen.getByRole("button", { name: "Bắt đầu" });
    expect(start).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "Túi giấy kraft quai xoắn" }));
    await userEvent.click(screen.getByRole("radio", { name: "Cỡ M" }));
    await waitFor(() => expect(start).toBeEnabled());

    await userEvent.click(start);
    expect(env.push).toHaveBeenCalledWith("/design/new?product=tui-giay-kraft&sku=BAG-KRAFT-M");
  });

  it("keeps Bắt đầu disabled for a variant without a print configuration", async () => {
    open();
    await userEvent.click(screen.getByRole("button", { name: "Túi giấy kraft quai xoắn" }));
    await userEvent.click(screen.getByRole("radio", { name: "Cỡ L" }));

    expect(await screen.findByText("Quy cách này chưa nhận thiết kế.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bắt đầu" })).toBeDisabled();
    expect(env.push).not.toHaveBeenCalled();
  });

  it("filters the products by what the customer types", async () => {
    open();
    await userEvent.type(screen.getByRole("searchbox", { name: "Tìm sản phẩm" }), "ly giấy");

    expect(screen.getByRole("button", { name: "Ly giấy 2 lớp 12oz" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Túi giấy kraft quai xoắn" }),
    ).not.toBeInTheDocument();
  });
});
