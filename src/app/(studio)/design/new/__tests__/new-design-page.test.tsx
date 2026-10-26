import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import NewDesignPage from "../page";

const env = vi.hoisted(() => ({ isMock: true }));
vi.mock("@/providers/app-providers", () => ({ useIsMock: () => env.isMock }));
vi.mock("@/features/product-design/components/new-design-screen", () => ({
  NewDesignScreen: ({ product, sku }: { product: string; sku: string | null }) => (
    <p>{`launcher for ${product} / ${sku ?? "no sku"}`}</p>
  ),
}));

beforeEach(() => {
  env.isMock = true;
});

const open = async (searchParams: Record<string, string | string[] | undefined>) =>
  render(await NewDesignPage({ searchParams: Promise.resolve(searchParams) }));

describe("/design/new", () => {
  it("opens the launcher for the product and SKU of the link", async () => {
    await open({ product: "ly-giay-2-lop-12oz", sku: "CUP-PAPER-12OZ-WHT" });
    expect(screen.getByText("launcher for ly-giay-2-lop-12oz / CUP-PAPER-12OZ-WHT")).toBeVisible();
  });

  it("opens the launcher without a SKU when the link has none, or a blank one", async () => {
    const { unmount } = await open({ product: "ly-giay-2-lop-12oz" });
    expect(screen.getByText("launcher for ly-giay-2-lop-12oz / no sku")).toBeVisible();
    unmount();

    await open({ product: "ly-giay-2-lop-12oz", sku: "  " });
    expect(screen.getByText("launcher for ly-giay-2-lop-12oz / no sku")).toBeVisible();
  });

  it("takes the first value of a repeated parameter", async () => {
    await open({ product: ["tui-giay-kraft", "other"], sku: ["BAG-KRAFT-L", "BAG-KRAFT-M"] });
    expect(screen.getByText("launcher for tui-giay-kraft / BAG-KRAFT-L")).toBeVisible();
  });

  it("sends a visitor with no product to the catalogue", async () => {
    await open({});
    expect(screen.getByText("Chưa chọn sản phẩm để thiết kế")).toBeVisible();
    expect(screen.getByRole("link", { name: "Xem sản phẩm" })).toHaveAttribute("href", "/catalog");
    expect(screen.queryByText(/launcher for/)).not.toBeInTheDocument();
  });

  it("sends a visitor with no product to Sales while customers cannot start a design", async () => {
    env.isMock = false;
    await open({});
    expect(screen.getByText("Thiết kế trực tuyến chưa mở")).toBeVisible();
    expect(screen.queryByText("Chưa chọn sản phẩm để thiết kế")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Nhắn Sales" })).toHaveAttribute("href", "/chat");
    expect(screen.getByRole("link", { name: "Xem sản phẩm" })).toHaveAttribute("href", "/catalog");
  });
});
