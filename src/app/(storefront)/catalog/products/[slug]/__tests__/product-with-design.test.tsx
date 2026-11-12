import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { designBackend } from "@/features/product-design/__tests__/design-backend";
import { printConfigFor } from "@/lib/api/mock-fixtures/design-print-configs";
import { renderWithProviders, resetCart, signIn, signOut } from "@/test/render";

import { ProductWithDesign } from "../product-with-design";

// The mock adapter adds latency per request, and the page reads several (product, prices, stock…).
const WAIT = { timeout: 5000 };

const CUP = "ly-giay-2-lop-12oz";
const CUP_SKU = "CUP-PAPER-12OZ-WHT";

beforeEach(() => {
  resetCart();
  signIn();
});
afterEach(() => {
  vi.restoreAllMocks();
  signOut();
  resetCart();
});

/** The product page as the route composes it: the catalog screen with the design feature's entry. */
describe("the product page of a customizable product", () => {
  it("offers 'Thiết kế' for a variant with a print configuration, beside the Sales chat", async () => {
    await designBackend();
    renderWithProviders(<ProductWithDesign slug={CUP} />);

    expect(await screen.findByRole("link", { name: "Thiết kế" }, WAIT)).toHaveAttribute(
      "href",
      `/design/new?product=${CUP}&sku=${CUP_SKU}`,
    );
    expect(screen.getAllByRole("link", { name: "Chat với Sale" })).toHaveLength(1);
  });

  it("offers the Sales chat once for a variant without one, and says why it takes no design", async () => {
    await designBackend({
      printConfigFor: (slug, sku) => (sku === CUP_SKU ? null : printConfigFor(slug, sku)),
    });
    renderWithProviders(<ProductWithDesign slug={CUP} />);

    expect(
      await screen.findByText("Quy cách này chưa nhận thiết kế", undefined, WAIT),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Chat với Sale" })).toHaveLength(1);
    expect(screen.queryByRole("link", { name: "Thiết kế" })).not.toBeInTheDocument();
  });
});
