import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Package } from "lucide-react";

import { Breadcrumbs, PageShell, Section, SurfaceCard, TrustBar } from "..";

describe("Breadcrumbs", () => {
  it("links items with href and marks the last item as the current page", () => {
    render(
      <Breadcrumbs
        items={[
          { label: "Trang chủ", href: "/" },
          { label: "Danh mục", href: "/catalog" },
          { label: "Áo thun" },
        ]}
      />,
    );
    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Trang chủ" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Danh mục" })).toHaveAttribute("href", "/catalog");
    const current = screen.getByText("Áo thun");
    expect(current).toHaveAttribute("aria-current", "page");
    expect(current.closest("a")).toBeNull();
  });
});

describe("Breadcrumbs separators", () => {
  it("hides the separators from assistive tech", () => {
    const { container } = render(
      <Breadcrumbs items={[{ label: "Trang chủ", href: "/" }, { label: "Giỏ hàng" }]} />,
    );
    const separators = container.querySelectorAll("li[aria-hidden='true']");
    expect(separators).toHaveLength(1);
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });
});

describe("PageShell", () => {
  it("renders actions even when no title is given", () => {
    render(
      <PageShell actions={<button type="button">Thêm mới</button>}>
        <p>Nội dung</p>
      </PageShell>,
    );
    expect(screen.getByRole("button", { name: "Thêm mới" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
  });

  it("renders the title as the only h1 and shows breadcrumbs when given", () => {
    render(
      <PageShell
        title="Giỏ hàng"
        breadcrumbs={[{ label: "Trang chủ", href: "/" }, { label: "Giỏ hàng" }]}
      >
        <p>Nội dung</p>
      </PageShell>,
    );
    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent("Giỏ hàng");
    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toBeInTheDocument();
    expect(screen.getByText("Nội dung")).toBeInTheDocument();
  });

  it("omits breadcrumbs when none are given", () => {
    render(<PageShell title="Giỏ hàng">x</PageShell>);
    expect(screen.queryByRole("navigation", { name: "Breadcrumb" })).not.toBeInTheDocument();
  });
});

describe("Section", () => {
  it("labels the region by its title and renders the action link", () => {
    render(
      <Section title="Sản phẩm nổi bật" action={{ href: "/catalog", label: "Xem tất cả" }}>
        <p>Danh sách</p>
      </Section>,
    );
    expect(screen.getByRole("region", { name: "Sản phẩm nổi bật" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Xem tất cả/ })).toHaveAttribute("href", "/catalog");
  });
});

describe("TrustBar", () => {
  it("renders the four default trust items", () => {
    render(<TrustBar />);
    for (const title of [
      "Giao hàng toàn quốc",
      "Đổi trả 7 ngày",
      "Thanh toán an toàn",
      "Hỗ trợ thiết kế",
    ]) {
      expect(screen.getByText(title)).toBeInTheDocument();
    }
  });
});

describe("TrustBar custom items", () => {
  it("renders the provided items instead of the defaults", () => {
    render(
      <TrustBar items={[{ icon: Package, title: "Đóng gói cẩn thận", desc: "Bảo vệ sản phẩm" }]} />,
    );
    expect(screen.getByText("Đóng gói cẩn thận")).toBeInTheDocument();
    expect(screen.queryByText("Giao hàng toàn quốc")).not.toBeInTheDocument();
  });
});

describe("SurfaceCard", () => {
  it("renders the requested element", () => {
    render(
      <SurfaceCard as="article">
        <p>Thẻ</p>
      </SurfaceCard>,
    );
    expect(screen.getByRole("article")).toBeInTheDocument();
  });

  it("applies card padding by default and omits it when padded is false", () => {
    const { rerender } = render(<SurfaceCard>a</SurfaceCard>);
    expect(screen.getByText("a")).toHaveClass("p-[var(--card-pad)]");
    rerender(<SurfaceCard padded={false}>a</SurfaceCard>);
    expect(screen.getByText("a")).not.toHaveClass("p-[var(--card-pad)]");
  });
});
