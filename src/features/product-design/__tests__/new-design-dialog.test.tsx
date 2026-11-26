import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/error";
import {
  MOCK_BLOCKED_SKU,
  MOCK_SKU_WITHOUT_PRINT_CONFIG,
} from "@/lib/api/mock-fixtures/design-print-configs";
import { renderWithProviders } from "@/test/render";

import {
  NewDesignDialog,
  type DesignableCatalogue,
  type DesignableProduct,
} from "../components/new-design-dialog";
import { designBackend } from "./design-backend";

const env = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: env.push }) }));

beforeEach(async () => {
  env.push.mockReset();
  await designBackend();
});
afterEach(() => vi.restoreAllMocks());

// The mock adapter adds latency per request, and a product's variants are each checked.
const WAIT = { timeout: 4000 };

const products = [
  { slug: "ly-giay-2-lop-12oz", title: "Ly giấy 2 lớp 12oz", skus: ["CUP-PAPER-12OZ-WHT"] },
  {
    slug: "tui-giay-kraft",
    title: "Túi giấy kraft quai xoắn",
    skus: ["BAG-KRAFT-M", MOCK_SKU_WITHOUT_PRINT_CONFIG],
  },
  { slug: "ly-giay-kraft-16oz", title: "Ly giấy kraft 16oz", skus: [MOCK_BLOCKED_SKU] },
];

/** From eight printable products on, the dialog offers the search box; fewer are all in view. */
const longList: DesignableProduct[] = [
  ...products,
  ...Array.from({ length: 5 }, (_, i) => ({
    slug: `hop-giay-${i + 1}`,
    title: `Hộp giấy mẫu ${i + 1}`,
    skus: [`BOX-${i + 1}`],
  })),
];

/** The catalogue answered: its products, no further page. */
const ready = (
  shown: DesignableProduct[] = products,
  more: Extract<DesignableCatalogue, { status: "ready" }>["more"] = null,
  onSearch: (text: string | null) => void = vi.fn(),
): DesignableCatalogue => ({ status: "ready", products: shown, stale: false, more, onSearch });

const open = (catalogue: DesignableCatalogue = ready()) =>
  renderWithProviders(<NewDesignDialog catalogue={catalogue} open onOpenChange={vi.fn()} />);

/** The page around the dialog: it searches by title, the way the catalogue does server-side. */
function SearchingPage({ onSearch }: { onSearch: (text: string | null) => void }) {
  const [open, setOpen] = useState(true);
  const [text, setText] = useState("");
  const shown = longList.filter((p) => p.title.toLowerCase().includes(text.toLowerCase()));
  const search = (next: string | null) => {
    onSearch(next);
    setText(next ?? "");
  };
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Mở lại
      </button>
      <NewDesignDialog catalogue={ready(shown, null, search)} open={open} onOpenChange={setOpen} />
    </>
  );
}

const searchBox = () => screen.getByRole("searchbox", { name: "Tìm sản phẩm" });
const pickProduct = (name: string) => userEvent.click(screen.getByRole("button", { name }));
const variant = (sku: string) => screen.getByRole("radio", { name: sku });

describe("NewDesignDialog", () => {
  it("asks for a product, then a variant by SKU, and starts on a variant that takes designs", async () => {
    open();
    const start = screen.getByRole("button", { name: "Bắt đầu" });
    expect(start).toBeDisabled();

    await pickProduct("Túi giấy kraft quai xoắn");
    await waitFor(() => expect(variant("BAG-KRAFT-M")).toBeEnabled(), WAIT);
    await userEvent.click(variant("BAG-KRAFT-M"));
    await waitFor(() => expect(start).toBeEnabled());

    await userEvent.click(start);
    expect(env.push).toHaveBeenCalledWith("/design/new?product=tui-giay-kraft&sku=BAG-KRAFT-M");
  });

  it("carries the project id to the launcher when the dialog is opened from a project", async () => {
    renderWithProviders(
      <NewDesignDialog catalogue={ready()} open onOpenChange={vi.fn()} projectId="p-1" />,
    );
    await pickProduct("Túi giấy kraft quai xoắn");
    await waitFor(() => expect(variant("BAG-KRAFT-M")).toBeEnabled(), WAIT);
    await userEvent.click(variant("BAG-KRAFT-M"));
    const start = screen.getByRole("button", { name: "Bắt đầu" });
    await waitFor(() => expect(start).toBeEnabled());
    await userEvent.click(start);
    expect(env.push).toHaveBeenCalledWith(
      "/design/new?product=tui-giay-kraft&sku=BAG-KRAFT-M&project=p-1",
    );
  });

  it("disables a variant without a print configuration, and says why (spec §6.3)", async () => {
    open();
    await pickProduct("Túi giấy kraft quai xoắn");

    await waitFor(() => expect(variant("BAG-KRAFT-M")).toBeEnabled(), WAIT);
    expect(variant(MOCK_SKU_WITHOUT_PRINT_CONFIG)).toBeDisabled();
    expect(variant(MOCK_SKU_WITHOUT_PRINT_CONFIG)).toHaveAccessibleDescription(
      "Chưa nhận thiết kế",
    );
    expect(screen.getByRole("button", { name: "Bắt đầu" })).toBeDisabled();
  });

  it("disables a variant that takes designs no more: the BE does not list it, so it reads as without a print configuration (F-22)", async () => {
    open();
    await pickProduct("Ly giấy kraft 16oz");

    await waitFor(
      () => expect(variant(MOCK_BLOCKED_SKU)).toHaveAccessibleDescription("Chưa nhận thiết kế"),
      WAIT,
    );
    expect(variant(MOCK_BLOCKED_SKU)).toBeDisabled();
  });

  it("says a variant whose check failed, and checks it again on Thử lại", async () => {
    const { get } = await designBackend();
    // A refusal is not retried by itself (a 5xx would be): the customer's Thử lại reads it again.
    get.mockRejectedValueOnce(new ApiError(403, "FORBIDDEN", "x"));
    open();
    await pickProduct("Ly giấy 2 lớp 12oz");

    expect(await screen.findByText("Chưa kiểm tra được", undefined, WAIT)).toBeInTheDocument();
    expect(variant("CUP-PAPER-12OZ-WHT")).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    await waitFor(() => expect(variant("CUP-PAPER-12OZ-WHT")).toBeEnabled(), WAIT);
  });

  it("asks the catalogue for what the customer types once typing stops, and lists its answer", async () => {
    const onSearch = vi.fn();
    renderWithProviders(<SearchingPage onSearch={onSearch} />);
    // Typed at once, so the assertion below cannot depend on the speed of the machine.
    await userEvent.type(searchBox(), "ly giấy 2", { delay: null });

    await waitFor(() => expect(onSearch).toHaveBeenLastCalledWith("ly giấy 2"), WAIT);
    // Debounced: the text typed on the way there was never asked for.
    expect(onSearch).not.toHaveBeenCalledWith("ly");
    expect(screen.getByRole("button", { name: "Ly giấy 2 lớp 12oz" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Túi giấy kraft quai xoắn" }),
    ).not.toBeInTheDocument();
  });

  it("lists what the catalogue answered, without filtering it again", async () => {
    open(ready(longList));
    await userEvent.type(searchBox(), "BAG-KRAFT");

    // The catalogue matched a SKU, which the title does not show: the dialog does not second-guess it.
    expect(screen.getByRole("button", { name: "Túi giấy kraft quai xoắn" })).toBeInTheDocument();
  });

  it("shows no search box for a short list: a handful of products is all in view", () => {
    open();

    expect(screen.queryByRole("searchbox", { name: "Tìm sản phẩm" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ly giấy 2 lớp 12oz" })).toBeInTheDocument();
  });

  it("shows the search box when the catalogue has further pages to look through", () => {
    open(ready(products, { onLoad: vi.fn(), loading: false, error: null }));

    expect(searchBox()).toBeInTheDocument();
  });

  it("chooses the only product and its only variant for the customer, and says what is still missing otherwise", async () => {
    open(ready([products[0]!]));

    await waitFor(() => expect(variant("CUP-PAPER-12OZ-WHT")).toBeChecked(), WAIT);
    await waitFor(() => expect(screen.getByRole("button", { name: "Bắt đầu" })).toBeEnabled());
    expect(screen.queryByText(/để tiếp tục/)).not.toBeInTheDocument();
  });

  it("names what is missing under a disabled Bắt đầu", async () => {
    open();
    expect(screen.getByText("Chọn sản phẩm và quy cách để tiếp tục")).toBeInTheDocument();

    await pickProduct("Túi giấy kraft quai xoắn");
    expect(await screen.findByText("Chọn quy cách để tiếp tục")).toBeInTheDocument();
  });

  it("puts the missing step under the Bắt đầu button, and says nothing while the variants are being checked", async () => {
    open();
    const start = screen.getByRole("button", { name: "Bắt đầu" });
    const hint = screen.getByText("Chọn sản phẩm và quy cách để tiếp tục");
    expect(start.compareDocumentPosition(hint) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await pickProduct("Túi giấy kraft quai xoắn");
    // The checks of its two variants run first: no "Chọn quy cách" yet.
    expect(screen.queryByText("Chọn quy cách để tiếp tục")).not.toBeInTheDocument();
    expect(
      await screen.findByText("Chọn quy cách để tiếp tục", undefined, WAIT),
    ).toBeInTheDocument();
  });

  it("says the product has no variant that takes designs, instead of asking for a choice", async () => {
    open();
    await pickProduct("Ly giấy kraft 16oz");

    expect(
      await screen.findByText("Sản phẩm này chưa có quy cách nhận thiết kế", undefined, WAIT),
    ).toBeInTheDocument();
    expect(screen.queryByText("Chọn quy cách để tiếp tục")).not.toBeInTheDocument();
  });

  it("shows no search box while the catalogue loads, so it does not flicker in and out for a short list", () => {
    open({ status: "loading", onSearch: vi.fn() });

    expect(screen.queryByRole("searchbox", { name: "Tìm sản phẩm" })).not.toBeInTheDocument();
  });

  it("says when no product matches", () => {
    open(ready([]));

    expect(screen.getByText("Không tìm thấy sản phẩm phù hợp.")).toBeInTheDocument();
  });

  it("keeps the chosen product and its variants when a new search leaves it out", async () => {
    renderWithProviders(<SearchingPage onSearch={vi.fn()} />);
    await pickProduct("Túi giấy kraft quai xoắn");
    await waitFor(() => expect(variant("BAG-KRAFT-M")).toBeEnabled(), WAIT);
    await userEvent.click(variant("BAG-KRAFT-M"));

    await userEvent.type(searchBox(), "ly giấy");
    await waitFor(
      () =>
        expect(
          screen.queryByRole("button", { name: "Túi giấy kraft quai xoắn" }),
        ).not.toBeInTheDocument(),
      WAIT,
    );

    expect(variant("BAG-KRAFT-M")).toBeChecked();
    await userEvent.click(screen.getByRole("button", { name: "Bắt đầu" }));
    expect(env.push).toHaveBeenCalledWith("/design/new?product=tui-giay-kraft&sku=BAG-KRAFT-M");
  });

  it("opens clean after it was closed: no search, no product, no variant (L2)", async () => {
    const onSearch = vi.fn();
    renderWithProviders(<SearchingPage onSearch={onSearch} />);
    await userEvent.type(searchBox(), "kraft");
    await waitFor(() => expect(onSearch).toHaveBeenLastCalledWith("kraft"), WAIT);
    await pickProduct("Túi giấy kraft quai xoắn");
    await waitFor(() => expect(variant("BAG-KRAFT-M")).toBeEnabled(), WAIT);
    await userEvent.click(variant("BAG-KRAFT-M"));

    await userEvent.click(screen.getByRole("button", { name: "Huỷ" }));
    // Closing drops the search and tells the page to stop reading the catalogue.
    expect(onSearch).toHaveBeenLastCalledWith(null);
    await userEvent.click(screen.getByRole("button", { name: "Mở lại" }));

    expect(await screen.findByRole("dialog", { name: "Thiết kế mới" })).toBeInTheDocument();
    expect(searchBox()).toHaveValue("");
    expect(screen.getByRole("button", { name: "Túi giấy kraft quai xoắn" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.queryByRole("radiogroup", { name: "Quy cách" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bắt đầu" })).toBeDisabled();
  });
});

describe("NewDesignDialog: further pages of the catalogue", () => {
  it("offers 'Xem thêm' while the catalogue has more, and loads the next page on click", async () => {
    const onLoad = vi.fn();
    open(ready(products, { onLoad, loading: false, error: null }));

    await userEvent.click(screen.getByRole("button", { name: "Xem thêm" }));
    expect(onLoad).toHaveBeenCalledTimes(1);
  });

  it("offers no 'Xem thêm' at the end of the catalogue", () => {
    open(ready(products, null));
    expect(screen.queryByRole("button", { name: "Xem thêm" })).not.toBeInTheDocument();
  });

  it("disables 'Xem thêm' while the next page loads", () => {
    open(ready(products, { onLoad: vi.fn(), loading: true, error: null }));
    expect(screen.getByRole("button", { name: "Đang tải thêm…" })).toBeDisabled();
  });

  it("never says 'no match' while further pages are still being read", () => {
    open(ready([], { onLoad: vi.fn(), loading: true, error: null }));

    expect(screen.queryByText("Không tìm thấy sản phẩm phù hợp.")).not.toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Đang tải danh sách sản phẩm" })).toBeInTheDocument();
  });

  it("says the next page failed, and 'Xem thêm' tries it again", async () => {
    const onLoad = vi.fn();
    open(ready(products, { onLoad, loading: false, error: new ApiError(503, "UNAVAILABLE", "x") }));

    const alert = screen.getByText("Không tải thêm được sản phẩm").closest("div")!;
    expect(
      within(alert).getByText(/Hệ thống đang gặp sự cố. Vui lòng thử lại sau ít phút./),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Xem thêm" }));
    expect(onLoad).toHaveBeenCalledTimes(1);
  });

  it("never says 'no match' while a new search loads behind an empty earlier answer", () => {
    open({ status: "ready", products: [], stale: true, more: null, onSearch: vi.fn() });

    expect(screen.queryByText("Không tìm thấy sản phẩm phù hợp.")).not.toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Đang tải danh sách sản phẩm" })).toBeInTheDocument();
  });

  it("marks the list busy while it still shows the previous search's products", () => {
    open({ status: "ready", products, stale: true, more: null, onSearch: vi.fn() });
    expect(screen.getByRole("list", { name: "Sản phẩm in được" })).toHaveAttribute(
      "aria-busy",
      "true",
    );
  });
});

describe("NewDesignDialog while the catalogue is not there", () => {
  it("shows the catalogue loading, never 'no match'", () => {
    open({ status: "loading", onSearch: vi.fn() });

    expect(screen.getByRole("status", { name: "Đang tải danh sách sản phẩm" })).toBeInTheDocument();
    expect(screen.queryByText("Không tìm thấy sản phẩm phù hợp.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bắt đầu" })).toBeDisabled();
  });

  it("says the catalogue failed, and retries it on request", async () => {
    const onRetry = vi.fn();
    open({
      status: "error",
      error: new ApiError(503, "UNAVAILABLE", "down"),
      onRetry,
      retrying: false,
      onSearch: vi.fn(),
    });

    expect(screen.getByText("Không tải được danh sách sản phẩm")).toBeInTheDocument();
    expect(screen.queryByText("Không tìm thấy sản phẩm phù hợp.")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
