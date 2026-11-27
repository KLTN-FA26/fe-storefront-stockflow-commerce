import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ProductCard } from "../product-card";
import { ProductGrid } from "../product-grid";

describe("ProductCard", () => {
  it("shows the media host's image as is and the stock badge, never a price (kltn-docs 13 BR-04)", () => {
    render(
      <ProductCard
        href="/catalog/ly"
        name="Ly giấy"
        imageSrc="https://cdn.example.vn/p/ly.jpg"
        imageAlt="Ly trắng"
        availability="low-stock"
      />,
    );
    const image = screen.getByRole("img", { name: "Ly trắng" });
    // Unoptimised: the BE's media host is not in next.config's remote patterns.
    expect(image.getAttribute("src")).toBe("https://cdn.example.vn/p/ly.jpg");
    expect(screen.queryByText(/₫/)).not.toBeInTheDocument();
    expect(screen.getByText("Sắp hết")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/catalog/ly");
  });

  it("draws its kind instead of a broken picture when there is none", () => {
    render(<ProductCard href="/catalog/ly" name="Ly giấy" />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("Chưa có ảnh sản phẩm")).toBeInTheDocument();
    expect(screen.queryByText(/₫/)).not.toBeInTheDocument();
  });

  it("treats a placehold.co box with the SKU on it as no picture (sf-01)", () => {
    render(
      <ProductCard
        href="/catalog/hop"
        name="Hộp giấy đựng bánh in logo"
        imageSrc="https://placehold.co/800x600?text=HOP-BANH-M"
      />,
    );
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("Chưa có ảnh sản phẩm")).toBeInTheDocument();
  });
});

describe("ProductGrid", () => {
  it("is a list, one item per product", () => {
    render(
      <ProductGrid
        products={[
          { id: "a", href: "/a", name: "A" },
          { id: "b", href: "/b", name: "B" },
        ]}
      />,
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });
});
