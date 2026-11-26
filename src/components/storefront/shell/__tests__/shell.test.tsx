import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render as rtlRender, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { defaultTrustItems } from "@/components/storefront/layout";
import { StorefrontShell } from "@/components/storefront/storefront-shell";
import { publishCurrentSearch } from "@/features/catalog/current-search-store";

import { HeaderSearch } from "../header-search";
import { footerColumns, mainLinks, paymentMethods, utilityLinks } from "../nav-config";
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

describe("HeaderSearch on /search", () => {
  afterEach(() => publishCurrentSearch(undefined));

  it("shows the text the search page is showing", () => {
    publishCurrentSearch({ q: "hoodie", sort: "title" });
    render(<HeaderSearch />);
    expect(screen.getByRole("combobox", { name: "Tìm sản phẩm" })).toHaveValue("hoodie");
  });

  it("starts empty anywhere else", () => {
    render(<HeaderSearch />);
    expect(screen.getByRole("combobox", { name: "Tìm sản phẩm" })).toHaveValue("");
  });
});

describe("SiteHeader", () => {
  it("renders a link for every main and utility entry", () => {
    render(<SiteHeader />);
    for (const { label } of [...mainLinks, ...utilityLinks]) {
      expect(screen.getAllByRole("link", { name: label }).length).toBeGreaterThan(0);
    }
  });

  it("names the logo and the account links, which show only an icon on small screens", () => {
    render(<SiteHeader />);
    expect(screen.getByRole("link", { name: "StockFlowCommerce – Trang chủ" })).toHaveAttribute(
      "href",
      "/",
    );
    // Signed out here: the entry is the sign-in link, named even where only its icon shows.
    expect(screen.getByRole("link", { name: "Đăng nhập" })).toHaveAttribute("href", "/login");
  });

  it("calls the chat 'Chat với Sale' (SF-UX-4)", () => {
    render(<SiteHeader />);
    for (const link of screen.getAllByRole("link", { name: /chat/i })) {
      expect(link).toHaveAccessibleName(expect.stringMatching(/^Chat với Sale/));
    }
  });

  it("has no retail category that leads nowhere but the catalogue (SF-UX-5)", () => {
    render(<SiteHeader />);
    for (const retail of ["Áo & hoodie", "Quà tặng in ấn", "Ấn phẩm doanh nghiệp"]) {
      expect(screen.queryByRole("link", { name: retail })).not.toBeInTheDocument();
    }
    expect(screen.getByRole("link", { name: "Sản phẩm" })).toHaveAttribute("href", "/catalog");
  });

  it("has no cart: the customer does not order on the portal (kltn-docs 14 BR-01)", () => {
    render(<SiteHeader />);
    expect(screen.queryByRole("link", { name: /Giỏ hàng/ })).not.toBeInTheDocument();
  });
});

describe("SiteFooter", () => {
  it("renders every payment method and the four value props", () => {
    render(<SiteFooter />);
    for (const method of paymentMethods) {
      expect(screen.getByText(method)).toBeInTheDocument();
    }
    expect(defaultTrustItems).toHaveLength(4);
    for (const { title } of defaultTrustItems) {
      expect(screen.getByText(title)).toBeInTheDocument();
    }
  });

  it("offers bank transfer only, no card brand (installments are paid by transfer)", () => {
    render(<SiteFooter />);
    const methods = screen.getByRole("list", { name: "Phương thức thanh toán" });
    expect(methods).toHaveTextContent("VietQR");
    expect(methods).toHaveTextContent("Chuyển khoản ngân hàng");
    expect(methods).not.toHaveTextContent(/Visa|Mastercard/);
  });

  it("makes no retail promise and names everything in Vietnamese (SF-UX-4, SF-UX-5)", () => {
    const { container } = render(<SiteFooter />);
    for (const retail of [
      /Đổi trả 7 ngày/,
      /2–4 ngày/,
      /thẻ/i,
      /Sales chat/,
      /Customer portal/,
      /Catalog/,
      /mobile-first/,
    ]) {
      expect(container).not.toHaveTextContent(retail);
    }
    expect(screen.getByRole("link", { name: "Chat với Sale" })).toHaveAttribute("href", "/chat");
  });

  it("links only to pages that exist: no privacy page (it was a 404)", () => {
    render(<SiteFooter />);
    expect(screen.queryByRole("link", { name: "Quyền riêng tư" })).not.toBeInTheDocument();
    const hrefs = footerColumns.flatMap((column) => column.links.map((link) => link.href));
    expect(hrefs).not.toContain("/account/privacy");
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
    // The header, the footer and the floating button: one name for the chat everywhere (SF-UX-4).
    expect(screen.getAllByRole("link", { name: "Chat với Sale" })).toHaveLength(3);
    expect(screen.getByText("Nội dung")).toBeInTheDocument();
  });

  it("hides the chat button on chat pages so it does not cover the composer", () => {
    navigation.pathname = "/chat/c1";
    render(
      <StorefrontShell>
        <p>Nội dung</p>
      </StorefrontShell>,
    );
    // Only the header's and the footer's: no floating button over the composer.
    expect(screen.getAllByRole("link", { name: "Chat với Sale" })).toHaveLength(2);
  });

  it("keeps room under the page on a phone so the floating button covers no content", () => {
    navigation.pathname = "/catalog";
    const { container } = render(
      <StorefrontShell>
        <p>Nội dung</p>
      </StorefrontShell>,
    );
    const space = container.querySelector("[data-chat-fab-space]");
    expect(space).not.toBeNull();
    expect(space).toHaveAttribute("aria-hidden", "true");
    // 80px ≥ the button (48px) and its offset (20px); only below md, coloured like the footer above it.
    expect(space?.className.split(" ")).toEqual(
      expect.arrayContaining(["h-20", "md:hidden", "bg-bg-surface"]),
    );
    // The last thing on the page, after the footer: nothing scrolls past it.
    expect(space?.previousElementSibling?.tagName).toBe("FOOTER");
  });

  it("leaves the floating button to phones and tablets in the account area, whose rail links to the chat", () => {
    navigation.pathname = "/account/orders/o1";
    const { container } = render(
      <StorefrontShell footer={false}>
        <p>Nội dung</p>
      </StorefrontShell>,
    );
    const space = container.querySelector("[data-chat-fab-space]");
    expect(space?.className.split(" ")).toContain("lg:hidden");
    expect(space?.className.split(" ")).not.toContain("md:hidden");
    expect(space?.nextElementSibling?.className.split(" ")).toContain("lg:hidden");
  });

  it("keeps no room on the chat thread, where the button is hidden", () => {
    navigation.pathname = "/chat/c1";
    const { container } = render(
      <StorefrontShell footer={false}>
        <p>Nội dung</p>
      </StorefrontShell>,
    );
    expect(container.querySelector("[data-chat-fab-space]")).toBeNull();
  });
});
