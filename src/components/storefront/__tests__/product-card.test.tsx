import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ProductCard } from "../product-card";
import { ProductGrid } from "../product-grid";

describe("ProductCard", () => {
  it("shows the media host's image as is, the price with its label and the stock badge", () => {
    render(
      <ProductCard
        href="/catalog/ly"
        name="Ly giấy"
        imageSrc="https://cdn.example.vn/p/ly.jpg"
        imageAlt="Ly trắng"
        price={720}
        priceLabel="Từ"
        availability="low-stock"
      />,
    );
    const image = screen.getByRole("img", { name: "Ly trắng" });
    // Unoptimised: the BE's media host is not in next.config's remote patterns.
    expect(image.getAttribute("src")).toBe("https://cdn.example.vn/p/ly.jpg");
    expect(screen.getByText("Từ")).toBeInTheDocument();
    expect(screen.getByText(/720/)).toBeInTheDocument();
    expect(screen.getByText("Sắp hết")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/catalog/ly");
  });

  it("says there is no picture instead of a broken one, and shows no price it does not have", () => {
    render(<ProductCard href="/catalog/ly" name="Ly giấy" />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("Chưa có hình ảnh")).toBeInTheDocument();
    expect(screen.queryByText(/₫/)).not.toBeInTheDocument();
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
