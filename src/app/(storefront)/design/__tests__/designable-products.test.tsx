import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { designBackend } from "@/features/product-design/__tests__/design-backend";
import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/error";
import { renderWithProviders, signIn, signOut } from "@/test/render";

import { DesignListWithCatalog } from "../designable-products";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

// The design list answers through the mock adapter's latency, and a search waits for typing to stop.
const WAIT = { timeout: 4000 };

/** The client as the mock adapter serves it, for every call the fake catalogue below does not take. */
const realGet = api.get.bind(api);

type Kind = "STANDARD" | "CUSTOMIZABLE";
let next = 0;
/** A catalogue row; `skus: null` is a row of an older BE, which sends no variants on the list. */
const card = (slug: string, title: string, kind: Kind | null, skus: string[] | null) => ({
  productId: `00000000-0000-4000-8000-${String((next += 1)).padStart(12, "0")}`,
  slug,
  title,
  ...(kind ? { kind } : {}),
  ...(skus ? { skus: skus.map((sku) => ({ sku })) } : {}),
});

/** The catalogue, three pages of it; the middle one holds nothing printable. */
const PAGES = [
  [
    card("ly-giay-2-lop-12oz", "Ly giấy 2 lớp 12oz", "CUSTOMIZABLE", ["CUP-PAPER-12OZ-WHT"]),
    card("hop-giay-mang-di-m", "Hộp giấy mang đi M", "STANDARD", ["BOX-TAKEAWAY-M"]),
    card("ly-giay-in-logo", "Ly giấy in logo", null, ["CUP-CUSTOM-LOGO"]),
    card("ly-nhua-pet-500ml", "Ly nhựa PET 500ml", "CUSTOMIZABLE", []),
    card("coc-su-11oz", "Cốc sứ 11oz", "CUSTOMIZABLE", null),
  ],
  [card("nap-ly-90mm", "Nắp ly 90mm", "STANDARD", ["LID-90MM-BLK"])],
  [card("tui-giay-kraft", "Túi giấy kraft quai xoắn", "CUSTOMIZABLE", ["BAG-KRAFT-M"])],
];

type CatalogRequest = { q: string | undefined; page: number; signal: AbortSignal | undefined };

type FakeCatalogueOptions = {
  /** The catalogue's pages (0-based); the three above by default. */
  pages?: ReturnType<typeof card>[][];
  /** A text whose answer never comes, until its request is called off. */
  hang?: string;
  /** A page (0-based) the BE refuses, every time it is asked (400: not retried by itself). */
  failPage?: number;
};

/** GET /catalog/products as the BE answers it: `q` searched in the titles (one page), else `pages`. */
function fakeCatalogue(
  get: Awaited<ReturnType<typeof designBackend>>["get"],
  { pages = PAGES, hang, failPage }: FakeCatalogueOptions = {},
) {
  const requests: CatalogRequest[] = [];
  get.mockImplementation(async (url, config) => {
    if (url !== "/catalog/products") return realGet(url, config);
    const params = (config?.params ?? {}) as { q?: string; page: number };
    const signal = config?.signal as AbortSignal | undefined;
    requests.push({ q: params.q, page: params.page, signal });
    if (hang !== undefined && params.q === hang) {
      return new Promise((_resolve, reject) =>
        signal?.addEventListener("abort", () => reject(new Error("aborted"))),
      );
    }
    if (params.page === failPage) throw new ApiError(400, "VALIDATION_FAILED", "x");
    const found = params.q
      ? [pages.flat().filter((row) => row.title.toLowerCase().includes(params.q!.toLowerCase()))]
      : pages;
    const items = found[params.page] ?? [];
    return {
      data: {
        items,
        page: params.page,
        size: 50,
        totalElements: found.flat().length,
        totalPages: found.length,
        hasNext: params.page + 1 < found.length,
        hasPrevious: params.page > 0,
      },
    };
  });
  return requests;
}

beforeEach(() => signIn());
afterEach(() => {
  vi.restoreAllMocks();
  signOut();
});

/** Opens "Thiết kế mới" on the list page and answers its product list. */
async function openDialog() {
  await userEvent.click(await screen.findByRole("button", { name: /Thiết kế mới/ }, WAIT));
  const dialog = await screen.findByRole("dialog", { name: "Thiết kế mới" });
  await within(dialog).findByRole("list", { name: "Sản phẩm in được" }, WAIT);
  return dialog;
}
const product = (name: string) => screen.queryByRole("button", { name });

describe("DesignListWithCatalog", () => {
  it("reads nothing of the catalogue until 'Thiết kế mới' opens, and stops when it closes", async () => {
    const { get } = await designBackend();
    const requests = fakeCatalogue(get);
    renderWithProviders(<DesignListWithCatalog />);
    await screen.findByRole("list", { name: "Danh sách thiết kế" }, WAIT);
    expect(requests).toEqual([]);

    const dialog = await openDialog();
    expect(requests.map((r) => r.page)).toEqual([0]);

    await userEvent.click(within(dialog).getByRole("button", { name: "Huỷ" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    // Closed, the query is off: "Xem thêm" pages are not read on, nothing is re-read.
    expect(requests.map((r) => r.page)).toEqual([0]);
  });

  it("offers the customizable products that have variants; a kind not sent counts as customizable", async () => {
    const { get } = await designBackend();
    fakeCatalogue(get);
    renderWithProviders(<DesignListWithCatalog />);
    await openDialog();

    expect(
      await screen.findByRole("button", { name: "Ly giấy 2 lớp 12oz" }, WAIT),
    ).toBeInTheDocument();
    expect(product("Ly giấy in logo")).toBeInTheDocument();
    expect(product("Hộp giấy mang đi M")).not.toBeInTheDocument(); // STANDARD
    expect(product("Ly nhựa PET 500ml")).not.toBeInTheDocument(); // no variant
    expect(product("Cốc sứ 11oz")).not.toBeInTheDocument(); // an older BE's row: no variants sent
  });

  it("gives the dialog the product's SKUs as its variants", async () => {
    const { get } = await designBackend();
    fakeCatalogue(get);
    renderWithProviders(<DesignListWithCatalog />);
    await openDialog();

    await userEvent.click(await screen.findByRole("button", { name: "Ly giấy 2 lớp 12oz" }, WAIT));
    expect(
      await screen.findByRole("radio", { name: "CUP-PAPER-12OZ-WHT" }, WAIT),
    ).toBeInTheDocument();
  });

  it("'Xem thêm' reads the next pages until one holds a printable product, then stops at the end", async () => {
    const { get } = await designBackend();
    const requests = fakeCatalogue(get);
    renderWithProviders(<DesignListWithCatalog />);
    await openDialog();

    await userEvent.click(await screen.findByRole("button", { name: "Xem thêm" }, WAIT));

    expect(
      await screen.findByRole("button", { name: "Túi giấy kraft quai xoắn" }, WAIT),
    ).toBeInTheDocument();
    expect(requests.map((r) => r.page)).toEqual([0, 1, 2]);
    // Appended: the first page's products are still there; the catalogue has no more.
    expect(product("Ly giấy 2 lớp 12oz")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Xem thêm" })).not.toBeInTheDocument();
  });

  it("searches the catalogue for the typed text once typing stops, and shows its answer", async () => {
    const { get } = await designBackend();
    const requests = fakeCatalogue(get);
    renderWithProviders(<DesignListWithCatalog />);
    const dialog = await openDialog();

    // Typed at once, so the assertion below cannot depend on the speed of the machine.
    await userEvent.type(within(dialog).getByRole("searchbox", { name: "Tìm sản phẩm" }), "túi", {
      delay: null,
    });

    expect(
      await screen.findByRole("button", { name: "Túi giấy kraft quai xoắn" }, WAIT),
    ).toBeInTheDocument();
    await waitFor(() => expect(product("Ly giấy 2 lớp 12oz")).not.toBeInTheDocument(), WAIT);
    // One request for the settled text, none for what was typed on the way to it.
    expect(requests.filter((r) => r.q !== undefined).map((r) => r.q)).toEqual(["túi"]);
  });

  it("calls off the read of a text the customer has typed past", async () => {
    const { get } = await designBackend();
    const requests = fakeCatalogue(get, { hang: "ly" });
    renderWithProviders(<DesignListWithCatalog />);
    const dialog = await openDialog();
    const box = within(dialog).getByRole("searchbox", { name: "Tìm sản phẩm" });

    await userEvent.type(box, "ly");
    await waitFor(() => expect(requests.some((r) => r.q === "ly")).toBe(true), WAIT);
    await userEvent.type(box, " giấy 2");

    await waitFor(() => expect(requests.some((r) => r.q === "ly giấy 2")).toBe(true), WAIT);
    expect(requests.find((r) => r.q === "ly")?.signal?.aborted).toBe(true);
    expect(
      await screen.findByRole("button", { name: "Ly giấy 2 lớp 12oz" }, WAIT),
    ).toBeInTheDocument();
  });

  describe("reading on to a page with a printable product stops", () => {
    /** Long enough for a request loop to show itself: the fake answers at once. */
    const settleDown = () => new Promise((resolve) => setTimeout(resolve, 300));

    it("when the next page fails: once, until the customer asks again with 'Xem thêm'", async () => {
      const { get } = await designBackend();
      const requests = fakeCatalogue(get, { failPage: 2 });
      renderWithProviders(<DesignListWithCatalog />);
      await openDialog();

      await userEvent.click(await screen.findByRole("button", { name: "Xem thêm" }, WAIT));
      expect(
        await screen.findByText("Không tải thêm được sản phẩm", undefined, WAIT),
      ).toBeVisible();
      await settleDown();
      // Page 1 holds nothing printable, so page 2 was read on to; its failure is not read again.
      expect(requests.map((r) => r.page)).toEqual([0, 1, 2]);

      await userEvent.click(screen.getByRole("button", { name: "Xem thêm" }));
      await waitFor(() => expect(requests.map((r) => r.page)).toEqual([0, 1, 2, 2]), WAIT);
      await settleDown();
      expect(requests).toHaveLength(4);
    });

    it("at the end of a catalogue with no printable product: 'no match', and nothing more is read", async () => {
      const { get } = await designBackend();
      const standard = (n: number) => card(`hop-${n}`, `Hộp giấy ${n}`, "STANDARD", [`BOX-${n}`]);
      const requests = fakeCatalogue(get, { pages: [[standard(1)], [standard(2)], [standard(3)]] });
      renderWithProviders(<DesignListWithCatalog />);
      await openDialog();

      expect(
        await screen.findByText("Không tìm thấy sản phẩm phù hợp.", undefined, WAIT),
      ).toBeVisible();
      expect(screen.queryByRole("button", { name: "Xem thêm" })).not.toBeInTheDocument();
      await settleDown();
      expect(requests.map((r) => r.page)).toEqual([0, 1, 2]);
    });
  });
});
