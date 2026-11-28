import type { QueryClient } from "@tanstack/react-query";
import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MOCK_DESIGN_IDS } from "@/lib/api/mock-fixtures/design-seed";
import { renderWithProviders, signIn, signOut } from "@/test/render";

import { DesignStudio } from "../components/studio/design-studio";
import { designKeys } from "../queries";
import type { DesignMockStore } from "@/lib/api/mock-fixtures/design-store";

import {
  cupWithText,
  designBackend,
  draftIn,
  STUDIO_PRODUCTS,
  submitElsewhere,
} from "./design-backend";
import { TEST_FONTS } from "./fixtures";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

beforeEach(() => signIn());
afterEach(() => {
  vi.unstubAllGlobals();
  signOut();
});

describe("studio shell: rail, panel, context bar and preview card", () => {
  // Each test renders the whole studio over the design mock (~0.2 s a request).
  vi.setConfig({ testTimeout: 20_000 });

  beforeEach(() => {
    // jsdom has no canvas: `getContext` logs "not implemented" before answering null.
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 404 })),
    );
  });
  afterEach(() => vi.restoreAllMocks());

  const OPENED = { timeout: 4000 };
  // "Công cụ" while it holds the tools, "Bảng" in a read-only design (only the lists).
  const rail = () => screen.getByRole("group", { name: /^(Công cụ|Bảng)$/ });
  const railItem = (name: string) => within(rail()).getByRole("button", { name });
  const toolOptions = () => screen.queryByRole("region", { name: "Tùy chọn công cụ" });
  const closeButton = () => screen.queryByRole("button", { name: "Đóng bảng" });
  const stage = () => screen.getByRole("group", { name: /^Khung vẽ/ });
  const pressed = (name: string) => railItem(name).getAttribute("aria-pressed");

  async function openStudio(designId: string) {
    renderWithProviders(<DesignStudio designId={designId} fonts={TEST_FONTS} />);
    await screen.findByRole("group", { name: /^(Công cụ|Bảng)$/ }, OPENED);
  }
  async function openCup() {
    const { store } = await designBackend();
    await openStudio(await draftIn(store, STUDIO_PRODUCTS.cup));
  }

  it("has a labelled rail: the six tools, then Lớp and Kiểm tra, no Lịch sử without history", async () => {
    await openCup();

    const items = within(rail()).getAllByRole("button");
    expect(items.map((item) => item.getAttribute("aria-label"))).toEqual([
      "Chọn (V)",
      "Ảnh/Logo (U)",
      "Chữ (T)",
      "Vẽ (B)",
      "Tẩy (E)",
      "Nền (G)",
      "Lớp",
      "Kiểm tra",
    ]);
    expect(items.map((item) => item.textContent)).toEqual([
      "Chọn",
      "Ảnh",
      "Chữ",
      "Vẽ",
      "Tẩy",
      "Nền",
      "Lớp",
      "Kiểm tra",
    ]);
    expect(rail()).toHaveClass("w-18");
    expect(toolOptions()).not.toBeInTheDocument();
    expect(closeButton()).not.toBeInTheDocument();
  });

  it("shows Lịch sử when the design has been through review, and opens it", async () => {
    const user = userEvent.setup();
    await designBackend();
    await openStudio(MOCK_DESIGN_IDS.returned);

    await user.click(await within(rail()).findByRole("button", { name: "Lịch sử" }, OPENED));
    const panel = screen.getByRole("region", { name: "Lịch sử" });
    expect(await within(panel).findByRole("list", {}, OPENED)).toBeInTheDocument();
  });

  it("a tool item sets the tool and opens its options; the active one again closes them", async () => {
    const user = userEvent.setup();
    await openCup();

    await user.click(railItem("Chữ (T)"));
    expect(pressed("Chữ (T)")).toBe("true");
    expect(pressed("Chọn (V)")).toBe("false");
    expect(within(toolOptions()!).getByRole("button", { name: "Thêm chữ" })).toBeInTheDocument();
    expect(within(toolOptions()!).getByRole("heading", { name: "Chữ" })).toBeInTheDocument();

    await user.click(railItem("Chữ (T)"));
    expect(toolOptions()).not.toBeInTheDocument();
    // The tool stays: closing the panel does not drop it.
    expect(pressed("Chữ (T)")).toBe("true");

    await user.click(railItem("Chữ (T)"));
    expect(toolOptions()).toBeInTheDocument();
  });

  it("another tool changes the options in place; Chọn closes the panel", async () => {
    const user = userEvent.setup();
    await openCup();

    await user.click(railItem("Vẽ (B)"));
    expect(within(toolOptions()!).getByText("Cỡ bút")).toBeInTheDocument();
    await user.click(railItem("Tẩy (E)"));
    expect(within(toolOptions()!).getByText("Cỡ tẩy")).toBeInTheDocument();

    await user.click(railItem("Chọn (V)"));
    expect(toolOptions()).not.toBeInTheDocument();
    expect(pressed("Chọn (V)")).toBe("true");
  });

  it("Chọn leaves an open list (Lớp, Kiểm tra) open", async () => {
    const user = userEvent.setup();
    await openCup();
    await user.click(railItem("Vẽ (B)"));
    await user.click(railItem("Lớp"));

    await user.click(railItem("Chọn (V)"));
    expect(screen.getByRole("region", { name: "Lớp" })).toBeInTheDocument();
    expect(pressed("Chọn (V)")).toBe("true");

    await user.click(railItem("Kiểm tra"));
    await user.click(railItem("Chọn (V)"));
    expect(screen.getByRole("region", { name: "Kiểm tra trước khi in" })).toBeInTheDocument();
  });

  it("Lớp and Kiểm tra open their panel and leave the tool alone", async () => {
    const user = userEvent.setup();
    await openCup();
    await user.click(railItem("Vẽ (B)"));

    await user.click(railItem("Lớp"));
    expect(screen.getByRole("region", { name: "Lớp" })).toBeInTheDocument();
    expect(toolOptions()).not.toBeInTheDocument();
    expect(pressed("Lớp")).toBe("true");
    expect(pressed("Vẽ (B)")).toBe("true");

    await user.click(railItem("Kiểm tra"));
    expect(screen.getByRole("region", { name: "Kiểm tra trước khi in" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Lớp" })).not.toBeInTheDocument();
    expect(pressed("Kiểm tra")).toBe("true");
    expect(pressed("Lớp")).toBe("false");

    await user.click(railItem("Kiểm tra"));
    expect(screen.queryByRole("region", { name: "Kiểm tra trước khi in" })).not.toBeInTheDocument();
    expect(pressed("Vẽ (B)")).toBe("true");
  });

  it("tool keys change the tool without opening or closing the panel; an open one follows", async () => {
    const user = userEvent.setup();
    await openCup();

    act(() => stage().focus());
    await user.keyboard("t");
    expect(pressed("Chữ (T)")).toBe("true");
    expect(toolOptions()).not.toBeInTheDocument();

    await user.click(railItem("Chữ (T)"));
    expect(toolOptions()).toBeInTheDocument();
    act(() => stage().focus());
    await user.keyboard("b");
    expect(pressed("Vẽ (B)")).toBe("true");
    expect(within(toolOptions()!).getByText("Cỡ bút")).toBeInTheDocument();
    await user.keyboard("v");
    expect(pressed("Chọn (V)")).toBe("true");
    expect(
      within(toolOptions()!).getByText(/để di chuyển, xoay hoặc đổi kích thước/),
    ).toBeInTheDocument();
  });

  it("the close button closes the panel and gives focus back to its rail item", async () => {
    const user = userEvent.setup();
    await openCup();

    await user.click(railItem("Lớp"));
    await user.click(closeButton()!);
    expect(screen.queryByRole("region", { name: "Lớp" })).not.toBeInTheDocument();
    expect(railItem("Lớp")).toHaveFocus();

    await user.click(railItem("Ảnh/Logo (U)"));
    await user.click(closeButton()!);
    expect(toolOptions()).not.toBeInTheDocument();
    expect(railItem("Ảnh/Logo (U)")).toHaveFocus();
  });

  it("Esc closes the panel from inside it and from the rail, returning focus to the rail item", async () => {
    const user = userEvent.setup();
    await openCup();

    await user.click(railItem("Kiểm tra"));
    act(() => closeButton()!.focus());
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("region", { name: "Kiểm tra trước khi in" })).not.toBeInTheDocument();
    expect(railItem("Kiểm tra")).toHaveFocus();

    await user.click(railItem("Vẽ (B)"));
    act(() => railItem("Chữ (T)").focus());
    await user.keyboard("{Escape}");
    expect(toolOptions()).not.toBeInTheDocument();
  });

  it("Esc on the stage does not close the panel", async () => {
    const user = userEvent.setup();
    await openCup();

    await user.click(railItem("Lớp"));
    act(() => stage().focus());
    await user.keyboard("{Escape}");
    expect(screen.getByRole("region", { name: "Lớp" })).toBeInTheDocument();
  });

  it("Esc in a field of the panel is the field's, not the panel's", async () => {
    const user = userEvent.setup();
    await openCup();

    await user.click(railItem("Nền (G)"));
    await user.click(within(toolOptions()!).getByRole("radio", { name: "Màu" }));
    const code = within(toolOptions()!).getByRole("textbox", { name: "Mã màu (#RRGGBB)" });
    await user.click(code);
    await user.keyboard("{Escape}");
    expect(toolOptions()).toBeInTheDocument();
  });

  it("puts the context bar under the header, with the print area at its end", async () => {
    await openCup();

    const bar = screen.getByRole("region", { name: "Thuộc tính phần tử" });
    expect(bar).toHaveTextContent("Chọn một phần tử");
    // A cup has one print area: its name, not a group.
    expect(within(bar).getByText("Thân ly")).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup", { name: "Mặt in" })).not.toBeInTheDocument();
  });

  it("a bag's faces are a Mặt in group in the bar, driving the active surface", async () => {
    const user = userEvent.setup();
    await designBackend();
    await openStudio(MOCK_DESIGN_IDS.draft);

    const bar = screen.getByRole("region", { name: "Thuộc tính phần tử" });
    const faces = within(bar).getByRole("radiogroup", { name: "Mặt in" });
    expect(
      within(faces)
        .getAllByRole("radio")
        .map((face) => face.textContent),
    ).toEqual(["Mặt trước", "Mặt sau", "Hông trái", "Hông phải"]);
    expect(within(faces).getByRole("radio", { name: "Mặt trước" })).toBeChecked();

    await user.click(within(faces).getByRole("radio", { name: "Mặt sau" }));
    expect(within(faces).getByRole("radio", { name: "Mặt sau" })).toBeChecked();
    expect(screen.getByRole("img", { name: "Bản thiết kế Mặt sau, 0 phần tử" })).toBeVisible();
    // Pressing the face that is active keeps it.
    await user.click(within(faces).getByRole("radio", { name: "Mặt sau" }));
    expect(within(faces).getByRole("radio", { name: "Mặt sau" })).toBeChecked();
  });

  it("below xl a bag's faces are a compact Mặt in list, so the bar keeps them whole", async () => {
    // Radix Select captures the pointer and scrolls its options into view; jsdom has neither.
    Element.prototype.hasPointerCapture = vi.fn(() => false);
    Element.prototype.releasePointerCapture = vi.fn();
    Element.prototype.scrollIntoView = vi.fn();
    const user = userEvent.setup();
    await designBackend();
    await openStudio(MOCK_DESIGN_IDS.draft);

    const bar = screen.getByRole("region", { name: "Thuộc tính phần tử" });
    const group = within(bar).getByRole("radiogroup", { name: "Mặt in" });
    const list = within(bar).getByRole("combobox", { name: "Mặt in" });
    // The group from xl, the list below it (the bar is as wide as the window).
    expect(group).toHaveClass("max-xl:hidden");
    expect(list).toHaveClass("xl:hidden");
    expect(list).toHaveTextContent("Mặt trước");

    await user.click(list);
    await user.click(await screen.findByRole("option", { name: "Hông trái" }));
    expect(list).toHaveTextContent("Hông trái");
    expect(within(group).getByRole("radio", { name: "Hông trái" })).toBeChecked();
    expect(screen.getByRole("img", { name: "Bản thiết kế Hông trái, 0 phần tử" })).toBeVisible();
  });

  it("read-only: the rail has only Lớp, Kiểm tra and Lịch sử; no context bar", async () => {
    await designBackend();
    await openStudio(MOCK_DESIGN_IDS.approved);

    await within(rail()).findByRole("button", { name: "Lịch sử" }, OPENED);
    const items = within(rail()).getAllByRole("button");
    expect(items.map((item) => item.getAttribute("aria-label"))).toEqual([
      "Lớp",
      "Kiểm tra",
      "Lịch sử",
    ]);
    expect(screen.queryByRole("button", { name: "Chữ (T)" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Thuộc tính phần tử" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Xem trước sản phẩm" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: /^Khung vẽ/ })).toBeInTheDocument();
  });

  it("read-only: Lớp opens with its controls disabled; Kiểm tra and Lịch sử open", async () => {
    const user = userEvent.setup();
    await designBackend();
    await openStudio(MOCK_DESIGN_IDS.approved);

    await user.click(railItem("Lớp"));
    const row = within(screen.getByRole("group", { name: "Chữ: Nhà Mình" }));
    for (const name of ["Ẩn", "Khoá", "Đưa xuống"]) {
      expect(row.getByRole("button", { name })).toBeDisabled();
    }
    await user.click(railItem("Kiểm tra"));
    expect(screen.getByRole("region", { name: "Kiểm tra trước khi in" })).toBeInTheDocument();
    await user.click(await within(rail()).findByRole("button", { name: "Lịch sử" }, OPENED));
    expect(
      await within(screen.getByRole("region", { name: "Lịch sử" })).findByRole("list", {}, OPENED),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Đóng bảng" }));
    expect(screen.queryByRole("region", { name: "Lịch sử" })).not.toBeInTheDocument();
  });

  it("the preview starts folded into its 3D pill, and opens as a card at the stage's bottom right, a sibling of the stage", async () => {
    await openCup();

    expect(screen.getByRole("button", { name: "Mở lại bản xem trước" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Xem trước sản phẩm", hidden: true })).toHaveClass(
      "hidden",
    );
    await userEvent.click(screen.getByRole("button", { name: "Mở lại bản xem trước" }));

    const card = screen.getByRole("region", { name: "Xem trước sản phẩm" });
    const sheet = screen.getByRole("region", { name: "Khung thiết kế" });
    expect(card.parentElement).toBe(sheet.parentElement);
    expect(card).toHaveClass("absolute", "right-3", "bottom-3", "w-75", "h-80");
  });

  it("a panel body is a focusable scroll region with a visible focus ring", async () => {
    const user = userEvent.setup();
    await openCup();

    await user.click(railItem("Lớp"));
    const body = within(screen.getByRole("region", { name: "Lớp" })).getByText(
      "Mặt này chưa có phần tử nào.",
    ).parentElement!;
    expect(body).toHaveAttribute("tabindex", "0");
    expect(body).toHaveClass("overflow-y-auto", "focus-visible:ring-2");
  });

  it("the panel never contains the stage's zoom bar or the face switcher", async () => {
    const user = userEvent.setup();
    await designBackend();
    await openStudio(MOCK_DESIGN_IDS.draft);
    await user.click(railItem("Lớp"));

    const panel = screen.getByRole("region", { name: "Lớp" });
    for (const name of ["Thu nhỏ", "Phóng to", "Vừa khung"]) {
      expect(panel).not.toContainElement(screen.getByRole("button", { name }));
    }
    expect(panel).not.toContainElement(screen.getByRole("radiogroup", { name: "Mặt in" }));
    // Below xl it floats above the zoom bar (bottom-17) rather than covering it.
    expect(panel).toHaveClass("max-xl:bottom-17");
  });

  it("read-only: the overlay starts below the face strip and ends above the zoom bar", async () => {
    const user = userEvent.setup();
    await designBackend();
    await openStudio(MOCK_DESIGN_IDS.approved);
    await user.click(railItem("Lớp"));

    const panel = screen.getByRole("region", { name: "Lớp" });
    expect(panel).toHaveClass("max-xl:top-15", "max-xl:bottom-17");
    expect(panel).not.toContainElement(screen.getByRole("button", { name: "Phóng to" }));
  });

  /**
   * Another tab submits the design: the store moves first, then the studio reads the design again
   * (as its status poll would), so its own status-follow refetch agrees with what it shows.
   */
  async function submitFromAnotherTab(store: DesignMockStore, client: QueryClient, id: string) {
    await submitElsewhere(store, id);
    await act(() => client.invalidateQueries({ queryKey: designKeys.detail(id) }));
    await screen.findByRole("group", { name: "Bảng" }, OPENED);
  }
  async function openDraftWithText() {
    const { store } = await designBackend();
    const id = await cupWithText(store);
    const { client } = renderWithProviders(<DesignStudio designId={id} fonts={TEST_FONTS} />);
    await screen.findByRole("group", { name: "Công cụ" }, OPENED);
    return { store, client, id };
  }

  it("a design that turns read-only drops the tool options and keeps the lists", async () => {
    const user = userEvent.setup();
    const { store, client, id } = await openDraftWithText();
    await user.click(railItem("Chữ (T)"));
    expect(toolOptions()).toBeInTheDocument();

    await submitFromAnotherTab(store, client, id);

    expect(toolOptions()).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Chữ (T)" })).not.toBeInTheDocument();
    // Submitted, it has a review history: Lịch sử joins the two lists.
    await within(rail()).findByRole("button", { name: "Lịch sử" }, OPENED);
    expect(
      within(rail())
        .getAllByRole("button")
        .map((item) => item.getAttribute("aria-label")),
    ).toEqual(["Lớp", "Kiểm tra", "Lịch sử"]);
    // The lists still open, and closing one lands focus on a rail item that exists.
    await user.click(railItem("Lớp"));
    await user.click(screen.getByRole("button", { name: "Đóng bảng" }));
    expect(railItem("Lớp")).toHaveFocus();
  });

  it("a design that turns read-only keeps its stage and preview mounted, and the focus on the stage", async () => {
    const { store, client, id } = await openDraftWithText();
    const sheet = screen.getByRole("region", { name: "Khung thiết kế" });
    const preview = screen.getByRole("region", { name: "Xem trước sản phẩm" });
    const view = stage();
    act(() => view.focus());

    await submitFromAnotherTab(store, client, id);

    expect(screen.getByRole("region", { name: "Khung thiết kế" })).toBe(sheet);
    expect(screen.getByRole("region", { name: "Xem trước sản phẩm" })).toBe(preview);
    expect(stage()).toBe(view);
    expect(view).toHaveFocus();
    // Laid out as the read-only split: the preview beside the stage, not its corner card.
    expect(preview).not.toHaveClass("absolute");
    expect(screen.queryByRole("region", { name: "Thuộc tính phần tử" })).not.toBeInTheDocument();
  });

  it("a design that turns read-only keeps an open list and the focus in it", async () => {
    const user = userEvent.setup();
    const { store, client, id } = await openDraftWithText();
    await user.click(railItem("Lớp"));
    const list = within(screen.getByRole("region", { name: "Lớp" })).getByRole("listbox");
    act(() => list.focus());

    await submitFromAnotherTab(store, client, id);

    expect(screen.getByRole("region", { name: "Lớp" })).toBeInTheDocument();
    expect(list).toHaveFocus();
  });

  it("focus on a tool that goes with the design's edit rights moves to the stage, not the page", async () => {
    const { store, client, id } = await openDraftWithText();
    act(() => railItem("Chữ (T)").focus());

    await submitFromAnotherTab(store, client, id);

    expect(stage()).toHaveFocus();
  });
});
