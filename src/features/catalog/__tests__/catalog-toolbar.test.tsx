import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CatalogToolbar } from "../components/catalog-toolbar";

const toolbar = (total: number, query?: string) =>
  render(
    <CatalogToolbar
      total={total}
      query={query}
      sort="default"
      onSortChange={vi.fn()}
      onClearQuery={vi.fn()}
    />,
  );
const count = () => screen.getByRole("status").textContent;

describe("CatalogToolbar count", () => {
  it("says the count exactly below the BE's 500-result window", () => {
    toolbar(499, "hộp");
    expect(count()).toBe("499 sản phẩm phù hợp");
    expect(screen.queryByText(/thêm từ khoá/)).not.toBeInTheDocument();
  });

  it("says 500+ at the window, since the BE ranks only the 500 best matches (SCRUM-170)", () => {
    toolbar(500, "hộp");
    expect(count()).toBe("500+ sản phẩm phù hợp");
    expect(screen.getByText(/thêm từ khoá để thu hẹp/)).toBeInTheDocument();
  });

  it("says 500+ for the plain catalogue too: the BE lists at most 500 there as well", () => {
    toolbar(500);
    expect(count()).toBe("500+ sản phẩm");
    expect(screen.getByText(/500 sản phẩm mới nhất/)).toBeInTheDocument();
  });
});
