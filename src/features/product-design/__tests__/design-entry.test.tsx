import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MOCK_BLOCKED_SKU } from "@/lib/api/mock-fixtures/design-print-configs";
import { renderWithProviders, signIn, signOut } from "@/test/render";

import { DesignEntry } from "../components/design-entry";
import { designBackend } from "./design-backend";

beforeEach(async () => {
  signIn();
  await designBackend();
});
afterEach(() => {
  vi.restoreAllMocks();
  signOut();
});

describe("DesignEntry", () => {
  it("offers 'Thiết kế' to the launcher for a variant with a print configuration", async () => {
    renderWithProviders(<DesignEntry productSlug="ly-giay-2-lop-12oz" sku="CUP-PAPER-12OZ-WHT" />);

    expect(await screen.findByRole("link", { name: "Thiết kế" })).toHaveAttribute(
      "href",
      "/design/new?product=ly-giay-2-lop-12oz&sku=CUP-PAPER-12OZ-WHT",
    );
    expect(screen.queryByText("Quy cách này chưa nhận thiết kế")).not.toBeInTheDocument();
  });

  it("says so and offers the Sales chat for a variant without one", async () => {
    renderWithProviders(<DesignEntry productSlug="tui-giay-kraft" sku="BAG-KRAFT-L" />);

    expect(await screen.findByText("Quy cách này chưa nhận thiết kế")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Chat với Sale" })).toHaveAttribute("href", "/chat");
    expect(screen.queryByRole("link", { name: "Thiết kế" })).not.toBeInTheDocument();
  });

  it("does the same for a variant that is no longer ACTIVE", async () => {
    renderWithProviders(<DesignEntry productSlug="ly-giay-kraft-16oz" sku={MOCK_BLOCKED_SKU} />);

    expect(await screen.findByText("Quy cách này chưa nhận thiết kế")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Thiết kế" })).not.toBeInTheDocument();
  });
});
