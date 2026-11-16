import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { signIn, signOut } from "@/test/render";

import { bagM, imageEl, textEl } from "../engine/__tests__/fixtures";
import { renderBar } from "./context-bar-harness";

vi.setConfig({ testTimeout: 15_000 });

// jsdom lays nothing out: widths come from these stubs, in px. A row is its fixed part plus each
// inline group and one 8 px gap per group (the bar's own gap); the end slot is `layout.end` wide.
const FIXED = 500;
const GROUP = 100;
const layout = { available: 2000, end: 0 };
const observers: ResizeObserverCallback[] = [];

beforeEach(() => {
  signIn();
  Element.prototype.scrollIntoView = vi.fn();
  observers.length = 0;
  layout.end = 0;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: ResizeObserverCallback) {
        observers.push(callback);
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(function (
    this: HTMLElement,
  ) {
    return "barSection" in this.dataset ? layout.available : 0;
  });
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(function (
    this: HTMLElement,
  ) {
    if ("barGroup" in this.dataset) return GROUP;
    if ("barEnd" in this.dataset) return layout.end;
    if ("barRow" in this.dataset) {
      return FIXED + this.querySelectorAll("[data-bar-group]").length * (GROUP + 8);
    }
    return 0;
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  signOut();
});

const resize = (available: number) => {
  layout.available = available;
  act(() => {
    for (const callback of observers) callback([], {} as ResizeObserver);
  });
};
const bar = () => screen.getByRole("region", { name: "Thuộc tính phần tử" });
const inline = (role: "button" | "radio" | "switch", name: string) =>
  within(bar()).queryByRole(role, { name });

describe("a bar too narrow for its groups", () => {
  it("keeps everything inline when there is room", () => {
    layout.available = 2000;
    renderBar([textEl("t")], { template: bagM });
    expect(inline("button", "Sao chép sang mặt khác")).toBeInTheDocument();
    expect(inline("button", "Lên lớp")).toBeInTheDocument();
    expect(inline("radio", "Căn trái")).toBeInTheDocument();
  });

  it("moves the lowest-priority groups into Thêm first, and brings them back when it widens", async () => {
    const user = userEvent.setup();
    layout.available = 1000; // 500 + 5 groups x 108 = 1040: one group too many
    renderBar([textEl("t")], { template: bagM });
    expect(inline("button", "Sao chép sang mặt khác")).not.toBeInTheDocument();
    expect(inline("button", "Lên lớp")).toBeInTheDocument();
    expect(inline("button", "Độ mờ")).toBeInTheDocument();

    resize(700); // layers, align and opacity go as well
    for (const name of ["Lên lớp", "Xuống lớp"]) {
      expect(inline("button", name), name).not.toBeInTheDocument();
    }
    expect(inline("radio", "Căn trái")).not.toBeInTheDocument();
    expect(inline("button", "Độ mờ")).not.toBeInTheDocument();
    for (const name of ["Vị trí", "Xoá", "Nhân bản", "Thêm", "Màu chữ, #000000"]) {
      expect(inline("button", name), name).toBeInTheDocument();
    }

    await user.click(screen.getByRole("button", { name: "Thêm" }));
    const more = await screen.findByRole("dialog");
    expect(within(more).getByRole("button", { name: "Lên lớp" })).toBeInTheDocument();
    expect(within(more).getByRole("button", { name: "Xuống lớp" })).toBeInTheDocument();
    expect(within(more).getByRole("radio", { name: "Căn trái" })).toBeInTheDocument();
    expect(within(more).getByRole("slider", { name: "Độ mờ đục" })).toBeInTheDocument();
    expect(
      within(more).getByRole("button", { name: "Sao chép sang mặt khác" }),
    ).toBeInTheDocument();
    // What Thêm always holds for a text.
    expect(within(more).getByRole("switch", { name: "Viền chữ" })).toBeInTheDocument();

    await user.keyboard("{Escape}");
    resize(2000);
    expect(inline("button", "Sao chép sang mặt khác")).toBeInTheDocument();
    expect(inline("button", "Lên lớp")).toBeInTheDocument();
    expect(inline("radio", "Căn trái")).toBeInTheDocument();
    expect(inline("button", "Độ mờ")).toBeInTheDocument();
  });

  it("moves the wrap switch and bold/italic last of the optional groups", () => {
    layout.available = 600; // only the fixed part and Thêm fit
    renderBar([textEl("t")]);
    expect(inline("switch", "Uốn theo thân ly")).not.toBeInTheDocument();
    expect(inline("button", "In đậm")).not.toBeInTheDocument();
    expect(inline("button", "Thêm")).toBeInTheDocument();
  });

  it("keeps bold and italic inline when only the groups before them must go", () => {
    layout.available = 900; // 500 + 3 groups x 108 = 824: bold/italic, wrap and opacity stay, alignment and layers go
    renderBar([textEl("t")]);
    expect(inline("button", "In đậm")).toBeInTheDocument();
    expect(inline("button", "Lên lớp")).not.toBeInTheDocument();
  });

  it("moves the image's flips, but never its resolution badge", () => {
    layout.available = 400;
    renderBar([imageEl("i")], { template: bagM });
    expect(inline("button", "Lật ngang")).not.toBeInTheDocument();
    expect(within(bar()).getByText(/DPI/)).toBeInTheDocument();
    expect(inline("button", "Xoá")).toBeInTheDocument();
  });

  it("moves a full text's note into Thêm before any other group", async () => {
    const user = userEvent.setup();
    layout.available = 1100; // 500 + 6 groups x 108 = 1148: the note alone has to go
    renderBar([textEl("t", { content: "a".repeat(500) })], { template: bagM });
    expect(within(bar()).queryByText(/Chữ đã đạt tối đa/)).not.toBeInTheDocument();
    expect(inline("button", "Sao chép sang mặt khác")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Thêm" }));
    const more = await screen.findByRole("dialog");
    expect(within(more).getByText(/phần gõ thêm sẽ không được nhận/)).toBeInTheDocument();
  });

  it("moves an upload error of Thay ảnh into Thêm first, and says it in the live region", async () => {
    const user = userEvent.setup({ applyAccept: false });
    layout.available = 560; // the fixed part and one group at most
    const h = renderBar([imageEl("i")], { template: bagM });

    await user.upload(
      screen.getByLabelText("Chọn ảnh thay thế"),
      new File([new Uint8Array([1])], "anh.gif", { type: "image/gif" }),
    );

    const refused = /^Định dạng không được hỗ trợ/;
    await waitFor(() =>
      expect(h.announce).toHaveBeenCalledWith(expect.stringMatching(refused), { urgent: true }),
    );
    resize(560); // the row grew by the error: its observer fires
    expect(within(bar()).queryByText(refused)).not.toBeInTheDocument();
    for (const name of ["Vị trí", "Nhân bản", "Xoá", "Thay ảnh", "Thêm"]) {
      expect(inline("button", name), name).toBeInTheDocument();
    }
    await user.click(screen.getByRole("button", { name: "Thêm" }));
    expect(within(await screen.findByRole("dialog")).getByText(refused)).toBeInTheDocument();
  });

  it("leaves the end slot its width: the groups fit what remains beside it", () => {
    layout.available = 1100;
    layout.end = 92; // 1100 - (92 + 8) = 1000, short of the 1040 the row needs: one group goes
    renderBar([textEl("t")], { template: bagM, end: <span>Mặt in</span> });
    expect(inline("button", "Sao chép sang mặt khác")).not.toBeInTheDocument();
    expect(inline("button", "Lên lớp")).toBeInTheDocument();

    layout.end = 0; // the same bar with nothing at its end has the room
    resize(1100);
    expect(inline("button", "Sao chép sang mặt khác")).toBeInTheDocument();
  });

  it("shows the end slot at any width", () => {
    layout.available = 300;
    renderBar([textEl("t")], { end: <span>Mặt in</span> });
    expect(within(bar()).getByText("Mặt in")).toBeInTheDocument();
  });

  it("follows a resize that happens after an element is selected on a bar mounted empty", () => {
    layout.available = 2000;
    const h = renderBar([textEl("t")], { selected: null, template: bagM });
    act(() => h.editor.select("t"));
    expect(inline("button", "Lên lớp")).toBeInTheDocument();
    resize(700);
    expect(inline("button", "Lên lớp")).not.toBeInTheDocument();
    expect(inline("radio", "Căn trái")).not.toBeInTheDocument();
    expect(inline("button", "Thêm")).toBeInTheDocument();
  });

  it("does not flip a group at the boundary width, tick after tick", () => {
    layout.available = 1000; // 1040 needed: the copy group (108) is hidden, 932 remain
    renderBar([textEl("t")], { template: bagM });
    expect(inline("button", "Sao chép sang mặt khác")).not.toBeInTheDocument();
    // 932 + 108 = 1040 fits exactly at 1040 and 1041, but not with the slack that keeps it stable.
    for (const width of [1040, 1041, 1040, 1041]) {
      resize(width);
      expect(inline("button", "Sao chép sang mặt khác"), String(width)).not.toBeInTheDocument();
    }
    for (const width of [1060, 1059, 1060, 1059]) {
      resize(width);
      expect(inline("button", "Sao chép sang mặt khác"), String(width)).toBeInTheDocument();
    }
  });

  it("re-plans when the selection changes while groups are hidden", async () => {
    const user = userEvent.setup();
    layout.available = 560; // the fixed part and one group at most
    const h = renderBar([textEl("a"), imageEl("b")], { template: bagM, selected: "a" });
    expect(inline("radio", "Căn trái")).not.toBeInTheDocument();
    act(() => h.editor.select("b"));
    expect(inline("button", "Lật ngang")).not.toBeInTheDocument();
    expect(within(bar()).getByText(/DPI/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Thêm" }));
    const more = await screen.findByRole("dialog");
    expect(within(more).getByRole("button", { name: "Lật ngang" })).toBeInTheDocument();
    expect(within(more).queryByRole("radio", { name: "Căn trái" })).not.toBeInTheDocument();
  });

  it("leaves only the fixed controls and Thêm when nothing more can move, without failing", async () => {
    const user = userEvent.setup();
    layout.available = 100; // less than the fixed part: every group is in Thêm
    renderBar([imageEl("i")]);
    for (const name of ["Vị trí", "Nhân bản", "Xoá", "Vừa vùng an toàn", "Thêm"]) {
      expect(inline("button", name), name).toBeInTheDocument();
    }
    for (const name of ["Lật ngang", "Độ mờ", "Lên lớp"]) {
      expect(inline("button", name), name).not.toBeInTheDocument();
    }
    expect(inline("switch", "Uốn theo thân ly")).not.toBeInTheDocument();
    resize(90);
    await user.click(screen.getByRole("button", { name: "Thêm" }));
    const more = await screen.findByRole("dialog");
    expect(within(more).getByRole("switch", { name: "Uốn theo thân ly" })).toBeInTheDocument();
    expect(within(more).getByRole("button", { name: "Lên lớp" })).toBeInTheDocument();
  });
});
