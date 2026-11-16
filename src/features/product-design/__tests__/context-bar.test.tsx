import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { signIn, signOut } from "@/test/render";

import { useRecentColors } from "../components/studio/color-field";
import { centredPlacement } from "../components/studio/element-actions";
import { replacementPatch } from "../components/studio/image-actions";
import { fitPlacement } from "../components/studio/safe-fit";
import { SurfaceSwitcher } from "../components/studio/surface-switcher";
import { createSurfaces } from "../engine";
import { bagM, cup12oz, drawingEl, imageEl, textEl } from "../engine/__tests__/fixtures";
import { elementsOf, imageOf, renderBar, textOf } from "./context-bar-harness";

vi.setConfig({ testTimeout: 15_000 });

// The picked replacement: the upload itself (a mutation against the API) is not under test here.
const picker = vi.hoisted(() => ({ pick: vi.fn() }));
vi.mock("../components/studio/use-asset-upload", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../components/studio/use-asset-upload")>()),
  useAssetPicker: () => ({ pick: picker.pick, busy: false, error: null, fail: vi.fn() }),
}));

beforeEach(() => {
  signIn();
  useRecentColors.setState({ colors: [] });
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  vi.restoreAllMocks();
  signOut();
});

describe("nothing selected", () => {
  it("shows a one-line hint and none of the element controls", () => {
    renderBar([textEl("t")], { selected: null });
    expect(screen.getByText(/Chọn một phần tử/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Vị trí" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Xoá" })).not.toBeInTheDocument();
  });

  it("offers copying a face where the template has another one", () => {
    renderBar([textEl("t")], { selected: null, template: bagM });
    expect(screen.getByRole("button", { name: "Sao chép sang mặt khác" })).toBeEnabled();
  });

  it("disables copying a face that is empty", () => {
    renderBar([], { template: bagM, selected: null });
    expect(screen.getByRole("button", { name: "Sao chép sang mặt khác" })).toBeDisabled();
  });

  it("keeps the end slot beside the hint", () => {
    renderBar([textEl("t")], { selected: null, end: <span>Mặt in</span> });
    expect(screen.getByText("Mặt in")).toBeInTheDocument();
  });

  it("keeps the face pressed in the end slot, and its focus, when the selection goes with it", async () => {
    const user = userEvent.setup();
    const h = renderBar([textEl("t")], { template: bagM, end: <SurfaceSwitcher /> });
    const back = screen.getByRole("radio", { name: "Mặt sau" });

    // A face change drops the selection: the bar turns to its hint, the end slot stays.
    await user.click(back);

    expect(h.editor.store.getState().selectedId).toBeNull();
    expect(screen.getByText(/Chọn một phần tử/)).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Mặt sau" })).toBe(back);
    expect(back).toBeChecked();
    expect(back).toHaveFocus();
  });
});

describe("a text", () => {
  it("shows the text controls and the common ones, with the end slot at the right", () => {
    renderBar([textEl("t", { name: "Lời chào" })], { end: <span>Mặt in</span> });
    expect(screen.getByRole("combobox", { name: /Phông chữ/ })).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: "Cỡ chữ (pt)" })).toHaveValue(24);
    for (const name of [
      "Màu chữ, #000000",
      "In đậm",
      "In nghiêng",
      "Thêm",
      "Vị trí",
      "Độ mờ",
      "Lên lớp",
      "Xuống lớp",
      "Nhân bản",
      "Xoá",
    ]) {
      expect(screen.getByRole("button", { name }), name).toBeInTheDocument();
    }
    expect(screen.getByRole("radio", { name: "Căn trái" })).toBeInTheDocument();
    expect(screen.getByText("Mặt in")).toBeInTheDocument();
    expect(screen.queryByRole("spinbutton", { name: "X (mm)" })).not.toBeInTheDocument();
  });

  it("writes the size, bold, alignment and the colour chosen in the popover to the document", async () => {
    const user = userEvent.setup();
    const h = renderBar([textEl("t")]);

    const size = screen.getByRole("spinbutton", { name: "Cỡ chữ (pt)" });
    await user.clear(size);
    await user.type(size, "36");
    expect(textOf(h).sizePt).toBe(36);

    await user.click(screen.getByRole("button", { name: "In đậm" }));
    expect(textOf(h).bold).toBe(true);

    await user.click(screen.getByRole("radio", { name: "Căn phải" }));
    expect(textOf(h).align).toBe("right");

    await user.click(screen.getByRole("button", { name: /^Màu chữ/ }));
    await user.click(screen.getByRole("button", { name: "Đỏ #DC2626" }));
    expect(textOf(h).color).toBe("#DC2626");
  });

  it("drops the italic flag when the font changes to one without italics", async () => {
    const user = userEvent.setup();
    const h = renderBar([textEl("t", { italic: true })]);
    await user.click(screen.getByRole("combobox", { name: /Phông chữ/ }));
    await user.click(await screen.findByText("Lobster"));
    expect(textOf(h).fontCode).toBe("lobster");
    expect(textOf(h).italic).toBe(false);
    const italic = screen.getByRole("button", { name: "In nghiêng" });
    expect(italic).toBeDisabled();
    expect(italic.closest("[title]")).toHaveAttribute("title", "Phông này không có kiểu nghiêng.");
  });

  it("shows the wrap switch on a cup only and writes it to the document", async () => {
    const user = userEvent.setup();
    const h = renderBar([textEl("t")]);
    const wrap = screen.getByRole("switch", { name: "Uốn theo thân ly" });
    expect(wrap).not.toBeChecked();
    await user.click(wrap);
    expect(textOf(h).wrap).toBe(true);
    expect(screen.getByRole("switch", { name: "Uốn theo thân ly" })).toBeChecked();
  });

  it("has no wrap switch on a flat face", () => {
    renderBar([textEl("t")], { template: bagM });
    expect(screen.queryByRole("switch", { name: "Uốn theo thân ly" })).not.toBeInTheDocument();
  });

  it("keeps outline, letter spacing and line height behind Thêm, opened and closed by keyboard", async () => {
    const user = userEvent.setup();
    const h = renderBar([textEl("t")]);
    expect(screen.queryByRole("switch", { name: "Viền chữ" })).not.toBeInTheDocument();

    const more = screen.getByRole("button", { name: "Thêm" });
    more.focus();
    await user.keyboard("{Enter}");
    await user.click(await screen.findByRole("switch", { name: "Viền chữ" }));
    expect(textOf(h).outline).toBeDefined();
    expect(screen.getByRole("spinbutton", { name: "Độ dày viền (mm)" })).toBeInTheDocument();

    const spacing = screen.getByRole("spinbutton", { name: "Giãn chữ (em)" });
    await user.clear(spacing);
    await user.type(spacing, "0.5");
    expect(textOf(h).letterSpacingEm).toBe(0.5);

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("switch", { name: "Viền chữ" })).not.toBeInTheDocument();
    expect(more).toHaveFocus();
  });

  it("writes the outline colour and width from Thêm", async () => {
    const user = userEvent.setup();
    const h = renderBar([textEl("t", { outline: { color: "#2563EB", widthMm: 0.5 } })]);
    await user.click(screen.getByRole("button", { name: "Thêm" }));
    const width = await screen.findByRole("spinbutton", { name: "Độ dày viền (mm)" });
    await user.clear(width);
    await user.type(width, "1.5");
    expect(textOf(h).outline?.widthMm).toBe(1.5);
    await user.click(screen.getByRole("button", { name: "Đỏ #DC2626" }));
    expect(textOf(h).outline?.color).toBe("#DC2626");
  });

  it("explains a full text with its consequence", () => {
    renderBar([textEl("t", { content: "a".repeat(500) })]);
    const note = screen.getByRole("status");
    expect(note).toHaveTextContent("Chữ đã đạt tối đa 500 ký tự");
    expect(note).toHaveTextContent(/phần gõ thêm sẽ không được nhận/i);
  });

  it("keeps a locked text as it is but still lets it be duplicated and faded", () => {
    renderBar([textEl("t", { locked: true })]);
    expect(screen.getByRole("spinbutton", { name: "Cỡ chữ (pt)" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "In đậm" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "Căn trái" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Xoá" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Nhân bản" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Độ mờ" })).toBeEnabled();
  });
});

describe("an image", () => {
  it("shows the DPI badge, flips and fit, and the wrap switch on a cup", async () => {
    const user = userEvent.setup();
    const h = renderBar([imageEl("i")]);
    expect(screen.getByText(/DPI/)).toBeInTheDocument();
    expect(screen.queryByRole("spinbutton", { name: "Cỡ chữ (pt)" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Lật ngang" }));
    expect(imageOf(h).flipX).toBe(true);
    expect(screen.getByRole("button", { name: "Lật ngang" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await user.click(screen.getByRole("button", { name: "Lật dọc" }));
    expect(imageOf(h).flipY).toBe(true);

    expect(screen.getByRole("button", { name: "Vừa vùng an toàn" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Thay ảnh" })).toBeEnabled();
    await user.click(screen.getByRole("switch", { name: "Uốn theo thân ly" }));
    expect(imageOf(h).wrap).toBe(true);
  });

  it("fits the image into the safe area", async () => {
    const user = userEvent.setup();
    const h = renderBar([imageEl("i", { widthMm: 900, heightMm: 600 })], { template: bagM });
    const surface = createSurfaces(bagM).byCode[h.code]!;
    const expected = fitPlacement(imageOf(h), surface);
    await user.click(screen.getByRole("button", { name: "Vừa vùng an toàn" }));
    expect(imageOf(h).placement).toEqual(expected);
  });

  it("replaces the image with the picked file, keeping its place", async () => {
    const user = userEvent.setup();
    const asset = {
      assetId: "asset-2",
      originalName: "moi.png",
      widthPx: 1000,
      heightPx: 1000,
    } as Parameters<typeof replacementPatch>[1];
    picker.pick.mockResolvedValue(asset);
    const h = renderBar([imageEl("i")]);
    const file = new File(["x"], "moi.png", { type: "image/png" });
    await user.upload(screen.getByLabelText("Chọn ảnh thay thế"), file);
    expect(picker.pick).toHaveBeenCalledWith(file);
    const expected = replacementPatch(imageEl("i"), asset);
    await vi.waitFor(() => expect(imageOf(h).assetId).toBe("asset-2"));
    expect(imageOf(h).widthMm).toBe(expected.widthMm);
    expect(imageOf(h).placement).toEqual(imageEl("i").placement);
  });

  it("has no wrap switch on a flat face", () => {
    renderBar([imageEl("i")], { template: bagM });
    expect(screen.queryByRole("switch", { name: "Uốn theo thân ly" })).not.toBeInTheDocument();
  });

  it("keeps a locked image as it is", () => {
    renderBar([imageEl("i", { locked: true })]);
    for (const name of ["Lật ngang", "Lật dọc", "Vừa vùng an toàn", "Thay ảnh", "Xoá"]) {
      expect(screen.getByRole("button", { name }), name).toBeDisabled();
    }
    expect(screen.getByRole("switch", { name: "Uốn theo thân ly" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Nhân bản" })).toBeEnabled();
  });
});

describe("a drawing", () => {
  it("shows how many strokes it holds, with the tool hint for assistive technology", () => {
    renderBar([
      drawingEl("d", {
        strokes: [
          { mode: "draw", color: "#000000", sizeMm: 2, points: [[0, 0, 1]] },
          { mode: "erase", color: "#000000", sizeMm: 2, points: [[0, 0, 1]] },
        ],
      }),
    ]);
    const count = screen.getByText("1 nét vẽ, 1 lần tẩy");
    expect(screen.queryByRole("switch", { name: "Uốn theo thân ly" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Vị trí" })).toBeInTheDocument();
    expect(count).toHaveAccessibleDescription(/phím B, E/);
  });
});

describe("the common controls", () => {
  it("sets the position and centres from the Vị trí popover", async () => {
    const user = userEvent.setup();
    const h = renderBar([textEl("t")], { template: bagM });
    await user.click(screen.getByRole("button", { name: "Vị trí" }));
    const x = await screen.findByRole("spinbutton", { name: "X (mm)" });
    expect(screen.queryByRole("spinbutton", { name: "Độ mờ đục (%)" })).not.toBeInTheDocument();
    await user.clear(x);
    await user.type(x, "50");
    expect(textOf(h).placement.u).toBe(50);

    const surface = createSurfaces(bagM).byCode[h.code]!;
    const before = textOf(h).placement;
    await user.click(screen.getByRole("button", { name: "Căn giữa ngang" }));
    expect(textOf(h).placement).toEqual(centredPlacement(before, surface, "u"));
    expect(textOf(h).placement.u).not.toBe(50);
    const afterU = textOf(h).placement;
    await user.click(screen.getByRole("button", { name: "Căn giữa dọc" }));
    expect(textOf(h).placement).toEqual(centredPlacement(afterU, surface, "v"));
  });

  it("sets the opacity with the slider of the Độ mờ popover, by keyboard", async () => {
    const user = userEvent.setup();
    const h = renderBar([textEl("t")]);
    await user.click(screen.getByRole("button", { name: "Độ mờ" }));
    const slider = await screen.findByRole("slider", { name: "Độ mờ đục" });
    slider.focus();
    await user.keyboard("{ArrowLeft}{ArrowLeft}");
    expect(textOf(h).opacity).toBeCloseTo(0.98);
  });

  it("moves the layer up and down, duplicates and deletes", async () => {
    const user = userEvent.setup();
    const h = renderBar([textEl("a"), textEl("b")], { selected: "a" });
    expect(screen.getByRole("button", { name: "Xuống lớp" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Lên lớp" }));
    expect(elementsOf(h).map((el) => el.id)).toEqual(["b", "a"]);

    await user.click(screen.getByRole("button", { name: "Nhân bản" }));
    expect(elementsOf(h).map((el) => el.id)).toEqual(["b", "a", "copy-1"]);
    expect(h.editor.store.getState().selectedId).toBe("copy-1");

    await user.click(screen.getByRole("button", { name: "Xoá" }));
    expect(elementsOf(h).map((el) => el.id)).toEqual(["b", "a"]);
  });

  it("copies the face to another one on a bag", async () => {
    const user = userEvent.setup();
    const h = renderBar([textEl("t")], { template: bagM });
    await user.click(screen.getByRole("button", { name: "Sao chép sang mặt khác" }));
    const other = bagM.printAreas.find((area) => area.code !== h.code)!;
    await user.click(await screen.findByRole("button", { name: other.name }));
    expect(h.editor.store.getState().document.surfaces[other.code]!.elements).toHaveLength(1);
  });

  it("disables every control of a text while the design is read-only", () => {
    renderBar([textEl("t")], { readOnly: true });
    const bar = screen.getByRole("region", { name: "Thuộc tính phần tử" });
    const buttons = within(bar).getAllByRole("button");
    expect(buttons.length).toBeGreaterThan(8);
    for (const button of buttons) expect(button).toBeDisabled();
    expect(screen.getByRole("spinbutton", { name: "Cỡ chữ (pt)" })).toBeDisabled();
    expect(screen.getByRole("switch", { name: "Uốn theo thân ly" })).toBeDisabled();
  });

  it("disables every control of an image while the design is read-only", () => {
    renderBar([imageEl("i")], { readOnly: true });
    const bar = screen.getByRole("region", { name: "Thuộc tính phần tử" });
    for (const button of within(bar).getAllByRole("button")) expect(button).toBeDisabled();
    expect(screen.getByRole("switch", { name: "Uốn theo thân ly" })).toBeDisabled();
  });

  it("shows the end slot for a drawing", () => {
    renderBar([drawingEl("d")], { end: <span>Mặt in</span> });
    expect(screen.getByText("Mặt in")).toBeInTheDocument();
    expect(cup12oz.printAreas.length).toBe(1);
  });
});

describe("popovers by keyboard", () => {
  it.each([
    ["Vị trí", "spinbutton", "X (mm)"],
    ["Độ mờ", "slider", "Độ mờ đục"],
    ["Màu chữ, #000000", "button", "Đỏ #DC2626"],
  ] as const)(
    "%s opens with Enter, closes with Esc and gives the focus back",
    async (trigger, role, inside) => {
      const user = userEvent.setup();
      renderBar([textEl("t")]);
      const button = screen.getByRole("button", { name: trigger });
      button.focus();
      await user.keyboard("{Enter}");
      expect(await screen.findByRole(role, { name: inside })).toBeInTheDocument();
      await user.keyboard("{Escape}");
      expect(screen.queryByRole(role, { name: inside })).not.toBeInTheDocument();
      expect(button).toHaveFocus();
    },
  );

  it("closes an open popover when the design turns read-only", async () => {
    const user = userEvent.setup();
    const h = renderBar([textEl("t")]);
    await user.click(screen.getByRole("button", { name: "Độ mờ" }));
    expect(await screen.findByRole("slider", { name: "Độ mờ đục" })).toBeInTheDocument();
    act(() => h.editor.setReadOnly(true));
    expect(screen.queryByRole("slider", { name: "Độ mờ đục" })).not.toBeInTheDocument();
    act(() => h.editor.setReadOnly(false));
    expect(screen.queryByRole("slider", { name: "Độ mờ đục" })).not.toBeInTheDocument();
  });
});
