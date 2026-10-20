import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render as rtlRender, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";

import { defaultTrustItems } from "@/components/storefront/layout";
import { StorefrontShell } from "@/components/storefront/storefront-shell";

import { HeaderSearch } from "../header-search";
import { categoryLinks, paymentMethods } from "../nav-config";
import { SiteFooter } from "../site-footer";
import { SiteHeader } from "../site-header";

const navigation = vi.hoisted(() => ({ pathname: "/" }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ push: vi.fn() }),
}));

// The header search and the cart badge read the session and the cart; the app provides the cache.
const render = (ui: ReactElement) =>
  rtlRender(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

vi.mock("@/components/storefront/theme-toggle", () => ({
  ThemeToggle: () => <button type="button">Chuyển giao diện</button>,
}));

describe("HeaderSearch", () => {
  it("submits a GET to /search with the q field", () => {
    render(<HeaderSearch />);
    const form = screen.getByRole("search");
    expect(form.getAttribute("action")).toMatch(/\/search$/);
    expect(form).toHaveAttribute("method", "get");
    expect(screen.getByRole("combobox", { name: "Tìm sản phẩm" })).toHaveAttribute("name", "q");
    expect(screen.getByRole("button", { name: "Tìm kiếm" })).toHaveAttribute("type", "submit");
  });
});

describe("SiteHeader", () => {
  it("renders a link for every category", () => {
    render(<SiteHeader />);
    for (const { label } of categoryLinks) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
    }
  });

  it("links the cart with its accessible name", () => {
    render(<SiteHeader />);
    expect(screen.getByRole("link", { name: /Giỏ hàng/ })).toHaveAttribute("href", "/cart");
  });
});

describe("SiteFooter", () => {
  it("renders every payment method and the four trust titles", () => {
    render(<SiteFooter />);
    for (const method of paymentMethods) {
      expect(screen.getByText(method)).toBeInTheDocument();
    }
    expect(defaultTrustItems).toHaveLength(4);
    for (const { title } of defaultTrustItems) {
      expect(screen.getByText(title)).toBeInTheDocument();
    }
  });
});

describe("StorefrontShell", () => {
  it("drops the floating cart button and keeps the chat button", () => {
    navigation.pathname = "/";
    render(
      <StorefrontShell>
        <p>Nội dung</p>
      </StorefrontShell>,
    );
    expect(screen.queryByLabelText("Mở giỏ hàng")).toBeNull();
    expect(screen.getByLabelText("Mở tư vấn")).toBeInTheDocument();
    expect(screen.getByText("Nội dung")).toBeInTheDocument();
  });

  it("hides the chat button on chat pages so it does not cover the composer", () => {
    navigation.pathname = "/chat/c1";
    render(
      <StorefrontShell>
        <p>Nội dung</p>
      </StorefrontShell>,
    );
    expect(screen.queryByLabelText("Mở tư vấn")).toBeNull();
  });
});
