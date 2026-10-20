import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/error";
import { createMockCatalog, seedMockCatalog } from "@/lib/api/mock-fixtures/catalog";
import { fakeBackend } from "@/test/fake-backend";
import { renderWithProviders, signIn, signOut } from "@/test/render";

import { CatalogSearchBox } from "../components/catalog-search-box";
import { SUGGESTION_RETRY_AFTER_MS } from "../queries";
import { publishCurrentSearch } from "../current-search-store";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

beforeEach(() => {
  push.mockReset();
  signIn();
  fakeBackend({ catalog: createMockCatalog(seedMockCatalog()) });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  signOut();
  publishCurrentSearch(undefined);
});

const box = () => screen.getByRole("combobox", { name: "Tìm sản phẩm" });
const suggestionCalls = () =>
  vi.mocked(api.get).mock.calls.filter(([url]) => url === "/catalog/search/suggestions");

describe("CatalogSearchBox", () => {
  it("stays a plain GET form to /search with a q field (works without JS)", () => {
    renderWithProviders(<CatalogSearchBox />);
    const form = screen.getByRole("search");
    expect(form).toHaveAttribute("method", "get");
    expect(form.getAttribute("action")).toMatch(/\/search$/);
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
    expect(push).toHaveBeenCalledWith("/catalog/products/ly-giay-2-lop-8oz");
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
    expect(push).toHaveBeenCalledWith(expect.stringMatching(/^\/catalog\/products\/ly-giay/));
  });

  it("opens the search page for the typed text on submit, URL-encoded", async () => {
    renderWithProviders(<CatalogSearchBox />);
    await userEvent.type(box(), "áo thun{Enter}");
    expect(push).toHaveBeenCalledWith("/search?q=%C3%A1o%20thun");
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
    expect(push).toHaveBeenCalledWith("/search?q=ly%20giay");
  });

  it("browses the whole catalogue when submitted empty", async () => {
    renderWithProviders(<CatalogSearchBox />);
    await userEvent.type(box(), "{Enter}");
    expect(push).toHaveBeenCalledWith("/catalog");
  });

  it("keeps the previous completions when the BE answers 429 RATE_LIMITED (SCRUM-469)", async () => {
    renderWithProviders(<CatalogSearchBox />);
    await userEvent.type(box(), "ly giay");
    await screen.findByRole("option", { name: /Ly giấy 2 lớp 8oz/ });

    vi.mocked(api.get).mockRejectedValueOnce(
      new ApiError(429, "RATE_LIMITED", "Too many requests", undefined, "corr-1"),
    );
    await userEvent.type(box(), " 2");
    await waitFor(() => expect(suggestionCalls()).toHaveLength(2));
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(screen.getByRole("option", { name: /Ly giấy 2 lớp 8oz/ })).toBeInTheDocument();
    expect(box()).toHaveAttribute("aria-expanded", "true");
  });

  it("asks once more after Retry-After (≈1 s) when the BE answers 429, and shows the new answer", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderWithProviders(<CatalogSearchBox />);
    vi.mocked(api.get).mockRejectedValueOnce(
      new ApiError(429, "RATE_LIMITED", "Too many requests", undefined, "corr-1"),
    );
    await userEvent.type(box(), "ly giay 2 lop 8");
    await waitFor(() => expect(suggestionCalls()).toHaveLength(1));
    expect(screen.queryByRole("option")).not.toBeInTheDocument();

    await act(() => vi.advanceTimersByTimeAsync(SUGGESTION_RETRY_AFTER_MS));
    expect(await screen.findByRole("option", { name: /Ly giấy 2 lớp 8oz/ })).toBeInTheDocument();
    expect(suggestionCalls()).toHaveLength(2);
  });

  it("keeps the last completions when the retry is refused too", async () => {
    renderWithProviders(<CatalogSearchBox />);
    await userEvent.type(box(), "ly giay");
    await screen.findByRole("option", { name: /Ly giấy 2 lớp 12oz/ });
    const limited = new ApiError(429, "RATE_LIMITED", "Too many requests", undefined, "corr-1");
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(api.get).mockRejectedValueOnce(limited).mockRejectedValueOnce(limited);
    await userEvent.type(box(), " 2 lop 8");
    await waitFor(() => expect(suggestionCalls()).toHaveLength(2));
    await act(() => vi.advanceTimersByTimeAsync(SUGGESTION_RETRY_AFTER_MS));
    await waitFor(() => expect(suggestionCalls()).toHaveLength(3));
    expect(screen.getByRole("option", { name: /Ly giấy 2 lớp 12oz/ })).toBeInTheDocument();
  });

  it("forgets the highlighted completion when a new list arrives", async () => {
    renderWithProviders(<CatalogSearchBox />);
    await userEvent.type(box(), "ly giay");
    expect(await screen.findAllByRole("option")).toHaveLength(4);

    // The next answer is held back: the previous 4 stay on screen meanwhile and get highlighted.
    let answer: (value: unknown) => void = () => {};
    vi.mocked(api.get).mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)));
    await userEvent.type(box(), " 2 lop 8");
    await waitFor(() => expect(suggestionCalls()).toHaveLength(2));
    await userEvent.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}");
    expect(screen.getAllByRole("option")[3]).toHaveAttribute("aria-selected", "true");

    answer({ data: [{ title: "Ly giấy 2 lớp 8oz", slug: "ly-giay-2-lop-8oz", sku: "CUP-1" }] });
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(1));

    expect(screen.getByRole("option")).toHaveAttribute("aria-selected", "false");
    expect(box()).not.toHaveAttribute("aria-activedescendant");
    await userEvent.keyboard("{Enter}");
    expect(push).toHaveBeenCalledWith("/search?q=ly%20giay%202%20lop%208");
  });

  it("shows the current search on /search and keeps its sort when the text changes", async () => {
    publishCurrentSearch({ q: "hoodie", sort: "title" });
    renderWithProviders(<CatalogSearchBox />);
    expect(box()).toHaveValue("hoodie");
    await userEvent.type(box(), " den{Enter}");
    expect(push).toHaveBeenCalledWith("/search?q=hoodie%20den&sort=title");

    // /search now shows the text sent; Back to another search is followed too.
    act(() => publishCurrentSearch({ q: "hoodie den", sort: "title" }));
    act(() => publishCurrentSearch({ q: "ao thun" }));
    expect(box()).toHaveValue("ao thun");
  });

  it("keeps what the customer is typing when the search page changes or is left", async () => {
    publishCurrentSearch({ q: "hoodie" });
    renderWithProviders(<CatalogSearchBox />);
    await userEvent.type(box(), " den");
    act(() => publishCurrentSearch(undefined));
    expect(box()).toHaveValue("hoodie den");
  });

  it("does not pop completions for the text already searched just because the box is focused", async () => {
    publishCurrentSearch({ q: "ly giay" });
    renderWithProviders(<CatalogSearchBox />);
    await userEvent.click(box());
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(suggestionCalls()).toHaveLength(0);
    expect(screen.queryByRole("option")).not.toBeInTheDocument();

    await userEvent.type(box(), " 2");
    expect(await screen.findAllByRole("option")).not.toHaveLength(0);
  });

  it("shows the new search when the page moves to another text, even over unsent typing", async () => {
    renderWithProviders(<CatalogSearchBox />);
    await userEvent.type(box(), "ly");
    act(() => publishCurrentSearch({ q: "hộp pizza" }));
    expect(box()).toHaveValue("hộp pizza");
  });

  it("opens the completions of the shown text with ArrowDown", async () => {
    publishCurrentSearch({ q: "ly giay" });
    renderWithProviders(<CatalogSearchBox />);
    await userEvent.click(box());
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
    await userEvent.keyboard("{ArrowDown}");
    expect(await screen.findAllByRole("option")).toHaveLength(4);
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getAllByRole("option")[0]).toHaveAttribute("aria-selected", "true");
  });

  it("lists a completion the BE sends without a SKU instead of dropping them all", async () => {
    vi.mocked(api.get).mockResolvedValueOnce({
      data: [
        { title: "Hộp bánh pizza", slug: "hop-pizza" },
        { title: "Hộp quà", slug: "hop-qua", sku: "BOX-GIFT" },
      ],
    });
    renderWithProviders(<CatalogSearchBox />);
    await userEvent.type(box(), "hop");
    expect(await screen.findByRole("option", { name: "Hộp bánh pizza" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Hộp quà/ })).toHaveTextContent("BOX-GIFT");
  });

  it("stays on /search when submitted empty there", async () => {
    publishCurrentSearch({ q: "hoodie" });
    renderWithProviders(<CatalogSearchBox />);
    await userEvent.clear(box());
    await userEvent.keyboard("{Enter}");
    expect(push).toHaveBeenCalledWith("/search");
  });

  it("drops the completions on any other failure", async () => {
    renderWithProviders(<CatalogSearchBox />);
    await userEvent.type(box(), "ly giay");
    await screen.findByRole("option", { name: /Ly giấy 2 lớp 8oz/ });

    vi.mocked(api.get).mockRejectedValueOnce(new ApiError(500, "INTERNAL_ERROR", "Boom"));
    await userEvent.type(box(), " 2");
    await waitFor(() => expect(suggestionCalls()).toHaveLength(2));
    await waitFor(() => expect(screen.queryByRole("option")).not.toBeInTheDocument());
  });
});
