import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import NewDesignPage from "../page";

vi.mock("@/features/product-design/components/new-design-screen", () => ({
  NewDesignScreen: ({ product, sku }: { product: string; sku: string }) => (
    <p>{`launcher for ${product} / ${sku}`}</p>
  ),
}));

// The chooser reads the catalogue and opens the dialog: it has its own test.
vi.mock("../new-design-chooser", () => ({
  NewDesignChooser: ({ projectId }: { projectId?: string }) => (
    <p>{`chooser${projectId ? ` for project ${projectId}` : ""}`}</p>
  ),
}));

const open = async (searchParams: Record<string, string | string[] | undefined>) =>
  render(await NewDesignPage({ searchParams: Promise.resolve(searchParams) }));

describe("/design/new", () => {
  it("opens the launcher for the product and SKU of the link", async () => {
    await open({ product: "ly-giay-2-lop-12oz", sku: "CUP-PAPER-12OZ-WHT" });
    expect(screen.getByText("launcher for ly-giay-2-lop-12oz / CUP-PAPER-12OZ-WHT")).toBeVisible();
  });

  it("takes the first value of a repeated parameter", async () => {
    await open({ product: ["tui-giay-kraft", "other"], sku: ["BAG-KRAFT-L", "BAG-KRAFT-M"] });
    expect(screen.getByText("launcher for tui-giay-kraft / BAG-KRAFT-L")).toBeVisible();
  });

  it.each([
    ["no product", {}],
    ["no SKU", { product: "ly-giay-2-lop-12oz" }],
    ["a blank SKU", { product: "ly-giay-2-lop-12oz", sku: "  " }],
  ])(
    "opens the product chooser instead of the launcher when the link has %s",
    async (_name, params) => {
      await open(params);
      expect(screen.getByText("chooser")).toBeVisible();
      expect(screen.queryByText(/launcher for/)).not.toBeInTheDocument();
    },
  );

  it("keeps the project the link names when it opens the chooser", async () => {
    await open({ project: "p-1" });
    expect(screen.getByText("chooser for project p-1")).toBeVisible();
  });
});
