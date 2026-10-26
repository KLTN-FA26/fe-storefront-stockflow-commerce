import { render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { ScrollAfterItems } from "../ScrollAfterItems";

beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

// jsdom has no layout: give every <li> a 100px row so measurements are predictable.
function mockRows() {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
    this: HTMLElement,
  ) {
    const index =
      this.tagName === "LI" ? Array.from(this.parentElement!.children).indexOf(this) : -1;
    const top = index >= 0 ? index * 100 : 0;
    return { top, bottom: index >= 0 ? top + 100 : 0 } as DOMRect;
  });
}

function renderList(count: number) {
  return render(
    <ScrollAfterItems visibleItems={4} label="Danh sách đơn hàng">
      <ul>
        {Array.from({ length: count }, (_, i) => (
          <li key={i}>Đơn {i + 1}</li>
        ))}
      </ul>
    </ScrollAfterItems>,
  );
}

describe("ScrollAfterItems", () => {
  it("does not scroll when there are at most 4 items", () => {
    mockRows();
    renderList(4);
    expect(screen.queryByRole("region", { name: "Danh sách đơn hàng" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
  });

  it("caps the height at the 4th item and becomes a focusable scroll region beyond 4", () => {
    mockRows();
    renderList(6);
    const region = screen.getByRole("region", { name: "Danh sách đơn hàng" });
    expect(region).toHaveAttribute("tabindex", "0");
    // 4th row ends at 400px, plus 4px room for the card shadow.
    expect(region).toHaveStyle({ maxHeight: "404px" });
    expect(screen.getAllByRole("listitem")).toHaveLength(6);
  });
});
