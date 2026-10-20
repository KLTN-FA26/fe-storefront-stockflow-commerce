import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CatalogToolbar } from "../components/catalog-toolbar";
import type { CatalogSort } from "../sorts";

const toolbar = (total: number | undefined, query?: string, sort: CatalogSort = "default") =>
  render(
    <CatalogToolbar
      total={total}
      query={query}
      sort={sort}
      onSortChange={vi.fn()}
      onClearQuery={vi.fn()}
    />,
  );
/** The count line, read as one sentence ("499 sản phẩm phù hợp"). */
const count = () =>
  screen.getByText((_, el) => el?.tagName === "P" && /^(\d|Đang tải)/.test(el.textContent ?? ""))
    .textContent;

describe("CatalogToolbar count", () => {
  it("says the count exactly below the BE's 500-result window", () => {
    toolbar(499, "hộp");
    expect(count()).toBe("499 sản phẩm phù hợp");
    expect(screen.queryByText(/Chỉ hiện/)).not.toBeInTheDocument();
  });

  it("says 500+ at the window, since the BE ranks only the 500 best matches (SCRUM-170)", () => {
    toolbar(500, "hộp", "title");
    expect(count()).toBe("500+ sản phẩm phù hợp");
    expect(screen.getByText(/500 kết quả khớp nhất — thêm từ khoá/)).toBeInTheDocument();
  });

  it("names the 500 the plain catalogue shows by its sort: newest by default", () => {
    toolbar(500);
    expect(count()).toBe("500+ sản phẩm");
    expect(screen.getByText(/500 sản phẩm mới nhất/)).toBeInTheDocument();
  });

  it("names them the first 500 by name when sorted by title (BE listAll orders the window)", () => {
    toolbar(500, undefined, "title");
    expect(screen.getByText(/500 sản phẩm đầu tiên theo tên/)).toBeInTheDocument();
    expect(screen.queryByText(/mới nhất/)).not.toBeInTheDocument();
  });

  it("is not a second status region: the grid skeleton already announces loading", () => {
    toolbar(undefined);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
