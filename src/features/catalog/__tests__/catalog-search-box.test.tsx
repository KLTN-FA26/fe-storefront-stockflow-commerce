import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api/client";
import { createMockCatalog, seedMockCatalog } from "@/lib/api/mock-fixtures/catalog";
import { fakeBackend } from "@/test/fake-backend";
import { renderWithProviders, signIn, signOut } from "@/test/render";

import { CatalogSearchBox } from "../components/catalog-search-box";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

beforeEach(() => {
  push.mockReset();
  signIn();
  fakeBackend({ catalog: createMockCatalog(seedMockCatalog()) });
});
afterEach(() => {
  vi.restoreAllMocks();
  signOut();
});

const box = () => screen.getByRole("combobox", { name: "Tìm sản phẩm" });
const suggestionCalls = () =>
  vi.mocked(api.get).mock.calls.filter(([url]) => url === "/catalog/search/suggestions");

describe("CatalogSearchBox", () => {
  it("stays a plain GET form to /catalog with a q field (works without JS)", () => {
    renderWithProviders(<CatalogSearchBox />);
    const form = screen.getByRole("search");
    expect(form).toHaveAttribute("method", "get");
    expect(form.getAttribute("action")).toMatch(/\/catalog$/);
    expect(box()).toHaveAttribute("name", "q");
  });

  it("completes titles after 2 characters, debounced, and goes to the product on click", async () => {
    renderWithProviders(<CatalogSearchBox />);
    await userEvent.type(box(), "ly giay");

    const option = await screen.findByRole("option", { name: /Ly giấy 2 lớp 8oz/ });
    expect(box()).toHaveAttribute("aria-expanded", "true");
    // Typing is debounced: one call for the text typed, not one per key.
    expect(suggestionCalls().length).toBeLessThanOrEqual(2);
    await userEvent.click(option);
    expect(push).toHaveBeenCalledWith("/catalog/ly-giay-2-lop-8oz");
  });

  it("asks nothing for a single character", async () => {
    renderWithProviders(<CatalogSearchBox />);
    await userEvent.type(box(), "l");
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(suggestionCalls()).toHaveLength(0);
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
  });

  it("asks nothing for one letter plus punctuation, which the BE would answer with 400", async () => {
    renderWithProviders(<CatalogSearchBox />);
    await userEvent.type(box(), "l!!");
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(suggestionCalls()).toHaveLength(0);
    await userEvent.type(box(), "y"); // "l!!y" is two letters once the punctuation is a word break
    await waitFor(() => expect(suggestionCalls()).toHaveLength(1));
    expect(suggestionCalls()[0]?.[1]).toMatchObject({ params: { q: "l!!y" } });
  });

  it("picks a completion with the keyboard", async () => {
    renderWithProviders(<CatalogSearchBox />);
    await userEvent.type(box(), "ly giay");
    await screen.findAllByRole("option");
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getAllByRole("option")[0]).toHaveAttribute("aria-selected", "true");
    await userEvent.keyboard("{Enter}");
    expect(push).toHaveBeenCalledWith(expect.stringMatching(/^\/catalog\/ly-giay/));
  });

  it("searches the catalogue for the typed text on submit, URL-encoded", async () => {
    renderWithProviders(<CatalogSearchBox />);
    await userEvent.type(box(), "áo thun{Enter}");
    expect(push).toHaveBeenCalledWith("/catalog?q=%C3%A1o%20thun");
  });

  it("closes the completions with Escape", async () => {
    renderWithProviders(<CatalogSearchBox />);
    await userEvent.type(box(), "ly giay");
    await screen.findAllByRole("option");
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(box()).toHaveAttribute("aria-expanded", "false"));
  });

  it("offers no completions to a visitor (the BE answers them to signed-in callers only)", async () => {
    signOut();
    renderWithProviders(<CatalogSearchBox />);
    await userEvent.type(box(), "ly giay");
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(suggestionCalls()).toHaveLength(0);
    await userEvent.keyboard("{Enter}");
    expect(push).toHaveBeenCalledWith("/catalog?q=ly%20giay");
  });
});
