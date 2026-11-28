import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { registerMockRoute } from "@/lib/api/mock-adapter";
import { printConfigFor } from "@/lib/api/mock-fixtures/design-print-configs";
import { MOCK_DESIGN_IDS } from "@/lib/api/mock-fixtures/design-seed";
import type { DesignMockStore } from "@/lib/api/mock-fixtures/design-store";
import { renderWithProviders, signIn, signOut } from "@/test/render";

import { DesignStudio } from "../components/studio/design-studio";
import { useRecentColors } from "../components/studio/color-field";
import type { StudioServices } from "../components/studio/studio-context";
import {
  elementOutline,
  emptyDocument,
  layoutText,
  removeElement,
  surfaceSnapTargets,
  type DesignElement,
  type FontRegistry,
  type TextElement,
} from "../engine";
import { cup12oz, imageEl, textEl } from "../engine/__tests__/fixtures";
import { designBackend, draftIn, STUDIO_PRODUCTS } from "./design-backend";
import { TEST_FONTS } from "./fixtures";

const env = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: env.push, replace: vi.fn() }),
}));

// Each test renders the whole studio and types key by key: well over 5 s in a loaded full run.
vi.setConfig({ testTimeout: 15_000 });

beforeEach(() => {
  signIn();
  useRecentColors.setState({ colors: [] });
  // jsdom has no canvas: `getContext` logs "not implemented" before answering null.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  // cmdk scrolls the highlighted font into view; jsdom lays nothing out.
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(null, { status: 404 })),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  signOut();
});

const SAMPLE_TEXT = "Cà phê Sữa Đá";
const FONTS: FontRegistry = {
  ...TEST_FONTS,
  montserrat: { label: "Montserrat", family: "Montserrat", italic: true },
};
/** More fonts than fit without a search field (more than 8). */
const MANY_FONTS: FontRegistry = {
  ...FONTS,
  ...Object.fromEntries(
    Array.from({ length: 8 }, (_, i) => [
      `extra-${i}`,
      { label: `Phông ${i + 1}`, family: `Phông ${i + 1}`, italic: false },
    ]),
  ),
};

/** A new 12oz cup draft whose body holds `elements` (bottom first). */
function cupDraft(studio: DesignMockStore, elements: DesignElement[] = []) {
  const document = {
    ...emptyDocument(cup12oz),
    surfaces: { BODY: { background: { kind: "none" as const }, elements } },
  };
  return draftIn(studio, STUDIO_PRODUCTS.cup, document, "Ly thử");
}

async function openStudio(designId: string, fonts: FontRegistry = TEST_FONTS) {
  const seen: { current?: StudioServices } = {};
  renderWithProviders(
    <DesignStudio
      designId={designId}
      fonts={fonts}
      onServices={(services) => {
        seen.current = services;
      }}
    />,
  );
  await screen.findByRole("group", { name: /^Khung vẽ/ }, { timeout: 4000 });
  return seen;
}

/** The design mock with every print configuration's template listing `allowedFontCodes`. */
const fontsRestrictedTo = (codes: string[] | null) => ({
  printConfigFor: (slug: string, sku: string) => {
    const config = printConfigFor(slug, sku);
    return config && { ...config, template: { ...config.template, allowedFontCodes: codes } };
  },
});

const elementsOf = (services: { current?: StudioServices }) =>
  services.current!.editor.store.getState().document.surfaces.BODY!.elements;
const textsOf = (services: { current?: StudioServices }) =>
  elementsOf(services).filter((el): el is TextElement => el.type === "text");
const lastText = (services: { current?: StudioServices }) => textsOf(services).at(-1)!;

const chooseTextTool = (user: UserEvent) =>
  user.click(screen.getByRole("button", { name: "Chữ (T)" }));
const addText = async (user: UserEvent, name = "Thêm chữ") => {
  await chooseTextTool(user);
  await user.click(screen.getByRole("button", { name }));
};
/** Closes the open panel with its button (a Lớp list would be a second listbox beside a font list). */
const closePanel = (user: UserEvent) =>
  user.click(screen.getByRole("button", { name: "Đóng bảng" }));
/** "Thêm" of the context bar: outline, letter spacing and line height. */
const openMore = (user: UserEvent) => user.click(screen.getByRole("button", { name: "Thêm" }));
/** The colour popover of the context bar; the swatches and the hex field are inside it. */
const openTextColour = async (user: UserEvent) => {
  await user.click(screen.getByRole("button", { name: /^Màu chữ/ }));
  return within(await screen.findByRole("group", { name: "Màu chữ" }));
};
/** The "Vị trí" popover of the context bar: X, Y, rotation and scale. */
const openPosition = (user: UserEvent) =>
  user.click(screen.getByRole("button", { name: "Vị trí" }));

/** Opens the layers panel from the rail, unless it is open already (the rail item toggles). */
async function showLayers(user: UserEvent) {
  const item = screen.getByRole("button", { name: "Lớp" });
  if (item.getAttribute("aria-pressed") !== "true") await user.click(item);
}
const editor = () => screen.getByRole<HTMLTextAreaElement>("textbox", { name: "Nội dung chữ" });
const undoButton = () => screen.getByRole("button", { name: "Hoàn tác (Ctrl+Z)" });
const stage = () => screen.getByRole("group", { name: "Khung vẽ Thân ly" });

describe("adding text", () => {
  it("keeps at most 500 characters of what is typed or pasted, and says so in the panel", async () => {
    const user = userEvent.setup();
    const { store: studio } = await designBackend();
    const services = await openStudio(await cupDraft(studio));

    await addText(user);
    await user.paste("Cà phê ".repeat(100)); // 700 characters over the selected placeholder
    expect([...lastText(services).content]).toHaveLength(500);
    await user.keyboard("{Escape}");
    expect(screen.getByText(/Chữ đã đạt tối đa 500 ký tự/)).toHaveAttribute("role", "status");
  });

  it("adds text, edits it inline and commits on Escape", async () => {
    const user = userEvent.setup();
    const { store: studio } = await designBackend();
    const services = await openStudio(await cupDraft(studio));

    await addText(user);
    const box = editor();
    expect(box).toHaveFocus();
    expect(box).toHaveValue("Nhập chữ");
    // The placeholder is selected: typing replaces it.
    expect([box.selectionStart, box.selectionEnd]).toEqual([0, "Nhập chữ".length]);
    expect(screen.getByText("Đã thêm chữ")).toBeInTheDocument();

    await user.clear(box);
    await user.type(box, `${SAMPLE_TEXT}{Escape}`);

    expect(screen.queryByRole("textbox", { name: "Nội dung chữ" })).not.toBeInTheDocument();
    await showLayers(user);
    expect(screen.getByRole("option", { name: `Chữ: ${SAMPLE_TEXT}` })).toBeInTheDocument();
    expect(lastText(services).content).toBe(SAMPLE_TEXT);
    expect(services.current!.editor.store.getState().selectedId).toBe(lastText(services).id);
  });

  it("adds the brief's defaults centred on the safe area, kept inside it", async () => {
    const user = userEvent.setup();
    const { store: studio } = await designBackend();
    const services = await openStudio(await cupDraft(studio));
    const surface = services.current!.surfaces.byCode.BODY!;
    const [centreU, centreV] = surfaceSnapTargets(surface, []);

    await addText(user);
    await user.keyboard("{Escape}");

    const text = lastText(services);
    expect(text).toMatchObject({
      content: "Nhập chữ",
      fontCode: "be-vietnam-pro",
      sizePt: 24,
      color: "#111111",
      align: "center",
      lineHeight: 1.2,
      letterSpacingEm: 0,
      bold: false,
      italic: false,
    });
    expect(text.placement.u).toBeCloseTo(centreU!.u!, 6);
    expect(text.placement.v).toBeCloseTo(centreV!.v!, 6);
    const box = services.current!.sizer(text);
    expect(elementOutline(text, surface, box).every((p) => surface.contains(p, "safe"))).toBe(true);
    // The pointer goes back to the select tool, where the text can be moved and resized.
    expect(services.current!.editor.store.getState().tool).toBe("select");
  });

  it.each([
    ["Tiêu đề", 48, true],
    ["Phụ đề", 24, false],
    ["Ghi chú", 12, false],
  ])("adds the %s preset at %i pt", async (name, sizePt, bold) => {
    const user = userEvent.setup();
    const { store: studio } = await designBackend();
    const services = await openStudio(await cupDraft(studio));

    await addText(user, name);
    expect(editor()).toBeInTheDocument();
    await user.keyboard("{Escape}");

    expect(lastText(services)).toMatchObject({ sizePt, bold });
  });

  it("measures and lays out Vietnamese text with the chosen font", async () => {
    const user = userEvent.setup();
    const { store: studio } = await designBackend();
    const services = await openStudio(await cupDraft(studio), FONTS);
    await addText(user);
    await user.clear(editor());
    await user.type(editor(), `${SAMPLE_TEXT}{Escape}`);
    await user.click(screen.getByRole("combobox", { name: /^Phông chữ/ }));
    await user.click(await screen.findByRole("option", { name: /Lobster/ }));

    const text = lastText(services);
    expect(text).toMatchObject({ content: SAMPLE_TEXT, fontCode: "lobster" });
    const { measure, sizer } = services.current!;
    const asked: string[] = [];
    const layout = layoutText(text, FONTS, (line, css) => {
      asked.push(css);
      return measure(line, css);
    });
    expect(asked.every((css) => css.includes('"Lobster"'))).toBe(true);
    expect(layout.lines[0]!.text).toBe(SAMPLE_TEXT);
    expect(sizer(text).width).toBeCloseTo(layout.widthMm, 6);
  });
});

describe("inline editing", () => {
  it("removes a text committed empty, in one undo step with its edits", async () => {
    const user = userEvent.setup();
    const { store: studio } = await designBackend();
    const services = await openStudio(await cupDraft(studio));
    await addText(user);

    await user.clear(editor());
    await user.keyboard("{Escape}");

    expect(textsOf(services)).toEqual([]);
    await showLayers(user);
    expect(screen.queryByRole("option", { name: /^Chữ/ })).not.toBeInTheDocument();
    expect(screen.getByText("Đã xoá phần tử")).toBeInTheDocument();
    // One step for the whole session: undo brings the placeholder back, not an empty text.
    await user.click(undoButton());
    expect(textsOf(services).map((t) => t.content)).toEqual(["Nhập chữ"]);
    await user.click(undoButton());
    expect(textsOf(services)).toEqual([]);
  });

  it("removes a whitespace-only text when focus leaves it", async () => {
    const user = userEvent.setup();
    const { store: studio } = await designBackend();
    const services = await openStudio(await cupDraft(studio));
    await addText(user);

    await user.clear(editor());
    await user.type(editor(), "   ");
    await user.tab();

    expect(screen.queryByRole("textbox", { name: "Nội dung chữ" })).not.toBeInTheDocument();
    expect(textsOf(services)).toEqual([]);
  });

  it("keeps the typed text when focus leaves it", async () => {
    const user = userEvent.setup();
    const { store: studio } = await designBackend();
    const services = await openStudio(await cupDraft(studio));
    await addText(user);

    await user.clear(editor());
    await user.type(editor(), "Xin chào");
    await user.tab();

    expect(screen.queryByRole("textbox", { name: "Nội dung chữ" })).not.toBeInTheDocument();
    expect(lastText(services).content).toBe("Xin chào");
    // One undo step for the whole session.
    await user.click(undoButton());
    expect(lastText(services).content).toBe("Nhập chữ");
  });

  it("inserts a newline on Enter and keeps the stage shortcuts out of the textarea", async () => {
    const user = userEvent.setup();
    const { store: studio } = await designBackend();
    const services = await openStudio(await cupDraft(studio));
    await addText(user);

    await user.clear(editor());
    await user.type(editor(), "tv{Enter}b{Delete}{Backspace}x");

    expect(editor()).toHaveValue("tv\nx");
    expect(textsOf(services)).toHaveLength(1);
    expect(services.current!.editor.store.getState().tool).toBe("select");
    await user.keyboard("{Escape}");
    expect(lastText(services).content).toBe("tv\nx");
  });

  it("does not commit an Escape that cancels an IME composition", async () => {
    const user = userEvent.setup();
    const { store: studio } = await designBackend();
    await openStudio(await cupDraft(studio));
    await addText(user);

    fireEvent.keyDown(editor(), { key: "Escape", isComposing: true });

    expect(editor()).toBeInTheDocument();
  });

  it("starts editing on Enter in the layers list", async () => {
    const user = userEvent.setup();
    const { store: studio } = await designBackend();
    await openStudio(await cupDraft(studio, [textEl("hello", { content: "Chào" })]));
    await showLayers(user);

    await user.click(screen.getByRole("option", { name: "Chữ: Chào" }));
    await user.keyboard("{Enter}");

    expect(editor()).toHaveValue("Chào");
    expect(editor()).toHaveFocus();
    await user.keyboard("{Escape}");
    // Escape hands focus back to where editing began.
    expect(screen.getByRole("listbox", { name: "Lớp" })).toHaveFocus();
  });

  it("starts editing on Enter on the stage, as one undo step, with no newline typed", async () => {
    const user = userEvent.setup();
    const { store: studio } = await designBackend();
    const services = await openStudio(
      await cupDraft(studio, [textEl("hello", { content: "Chào" })]),
    );
    await showLayers(user);
    await user.click(screen.getByRole("option", { name: "Chữ: Chào" }));
    act(() => stage().focus());

    await user.keyboard("{Enter}");

    expect(editor()).toHaveValue("Chào"); // the Enter did not land in the field as a line break
    expect(editor()).toHaveFocus();
    // Real content is not selected (a key would wipe it): the caret waits at its end.
    expect([editor().selectionStart, editor().selectionEnd]).toEqual([4, 4]);
    await user.type(editor(), "!{Enter}x{Escape}");
    expect(lastText(services).content).toBe("Chào!\nx");
    expect(stage()).toHaveFocus(); // Escape hands focus back to the stage
    await user.click(undoButton());
    expect(lastText(services).content).toBe("Chào");
  });

  it("does nothing on Enter on the stage unless an editable text is selected", async () => {
    const user = userEvent.setup();
    const { store: studio } = await designBackend();
    await openStudio(
      await cupDraft(studio, [
        imageEl("logo"),
        textEl("locked", { content: "Khoá", locked: true }),
      ]),
    );
    await showLayers(user);

    for (const name of ["Ảnh", "Chữ: Khoá"]) {
      await user.click(screen.getByRole("option", { name }));
      act(() => stage().focus());
      await user.keyboard("{Enter}");
      expect(screen.queryByRole("textbox", { name: "Nội dung chữ" })).not.toBeInTheDocument();
    }
    // Nothing selected at all.
    act(() => stage().focus());
    await user.keyboard("{Escape}{Enter}");
    expect(screen.queryByRole("textbox", { name: "Nội dung chữ" })).not.toBeInTheDocument();
  });

  it("does nothing on Enter on the stage of a read-only design", async () => {
    const user = userEvent.setup();
    await designBackend();
    const services = await openStudio(MOCK_DESIGN_IDS.approved);
    act(() => services.current!.editor.select("el-cup-1"));
    act(() => stage().focus());

    await user.keyboard("{Enter}");

    expect(screen.queryByRole("textbox", { name: "Nội dung chữ" })).not.toBeInTheDocument();
  });

  it("leaves Enter alone on the stage's own buttons", async () => {
    const user = userEvent.setup();
    const { store: studio } = await designBackend();
    const services = await openStudio(await cupDraft(studio, [textEl("hello")]));
    await showLayers(user);
    await user.click(screen.getByRole("option", { name: /^Chữ/ }));
    const zoomIn = screen.getByRole("button", { name: "Phóng to" });
    act(() => zoomIn.focus());

    await user.keyboard("{Enter}");

    expect(screen.queryByRole("textbox", { name: "Nội dung chữ" })).not.toBeInTheDocument();
    expect(services.current!.editor.store.getState().zoom).toBeGreaterThan(1); // it still zoomed
  });

  it("does not start editing a locked, hidden or read-only text", async () => {
    const user = userEvent.setup();
    const { store: studio } = await designBackend();
    await openStudio(
      await cupDraft(studio, [
        textEl("locked", { content: "Khoá", locked: true }),
        textEl("hidden", { content: "Ẩn", hidden: true }),
      ]),
    );
    await showLayers(user);

    await user.click(screen.getByRole("option", { name: "Chữ: Khoá" }));
    await user.keyboard("{Enter}");
    await user.click(screen.getByRole("option", { name: "Chữ: Ẩn" }));
    await user.keyboard("{Enter}");

    expect(screen.queryByRole("textbox", { name: "Nội dung chữ" })).not.toBeInTheDocument();
  });

  it("leaves a read-only design's text alone", async () => {
    const user = userEvent.setup();
    await designBackend();
    await openStudio(MOCK_DESIGN_IDS.approved);
    await showLayers(user);
    await user.click(screen.getByRole("option", { name: "Chữ: Nhà Mình" }));

    await user.keyboard("{Enter}");

    expect(screen.queryByRole("textbox", { name: "Nội dung chữ" })).not.toBeInTheDocument();
    // There is no context bar to change it with, and no tool items.
    expect(screen.queryByRole("combobox", { name: /^Phông chữ/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Chữ (T)" })).not.toBeInTheDocument();
  });
});

/**
 * jsdom lays nothing out: give the stage viewport a size (and a ResizeObserver that reports it)
 * so the stage has a scale and the overlay is drawn in screen px from the top-left at (0, 0).
 */
function sizeTheStage(width = 900, height = 700) {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(private readonly callback: ResizeObserverCallback) {}
      observe() {
        this.callback([], this as unknown as ResizeObserver);
      }
      unobserve() {}
      disconnect() {}
    },
  );
  vi.spyOn(Element.prototype, "clientWidth", "get").mockReturnValue(width);
  vi.spyOn(Element.prototype, "clientHeight", "get").mockReturnValue(height);
}

describe("on the stage", () => {
  beforeEach(() => sizeTheStage());

  it("starts editing on a double click, with the textarea on the text", async () => {
    const user = userEvent.setup();
    const { store: studio } = await designBackend();
    const text = textEl("hello", {
      content: SAMPLE_TEXT,
      placement: { u: 140, v: 55, rotationDeg: 0, scale: 1 },
    });
    const services = await openStudio(await cupDraft(studio, [text]));
    const svg = document.querySelector<SVGSVGElement>("svg[data-stage-overlay]")!;
    const surface = services.current!.surfaces.byCode.BODY!;
    const k = Number(svg.getAttribute("viewBox")!.split(" ")[2]) / surface.flatBounds.width;
    const { x, y } = surface.toFlat(140, 55);
    const at = {
      clientX: (x - surface.flatBounds.x) * k,
      clientY: (y - surface.flatBounds.y) * k,
    };

    fireEvent.doubleClick(svg, at);

    expect(editor()).toHaveValue(SAMPLE_TEXT);
    expect(services.current!.editor.store.getState().selectedId).toBe("hello");
    const style = editor().style;
    expect(parseFloat(style.left)).toBeCloseTo(at.clientX, 3);
    expect(parseFloat(style.top)).toBeCloseTo(at.clientY, 3);
    const layout = layoutText(text, TEST_FONTS, services.current!.measure);
    expect(parseFloat(style.width)).toBeGreaterThanOrEqual(layout.widthMm * k - 0.001);
    expect(parseFloat(style.fontSize)).toBeCloseTo(layout.fontSizeMm * k, 3);
    await user.keyboard("{Escape}");
    // Nothing took focus before the editor did (the body): the stage gets it back, so shortcuts work.
    expect(stage()).toHaveFocus();
  });

  it("shows a visible flat box for a text bent around the cup, and none over a flat text", async () => {
    const { store: studio } = await designBackend();
    const at = { placement: { u: 140, v: 55, rotationDeg: 0, scale: 1 } };
    const services = await openStudio(
      await cupDraft(studio, [textEl("flat", { ...at }), textEl("bent", { ...at, wrap: true })]),
    );
    const svg = document.querySelector<SVGSVGElement>("svg[data-stage-overlay]")!;
    const surface = services.current!.surfaces.byCode.BODY!;
    const k = Number(svg.getAttribute("viewBox")!.split(" ")[2]) / surface.flatBounds.width;
    const { x, y } = surface.toFlat(140, 55);
    const point = {
      clientX: (x - surface.flatBounds.x) * k,
      clientY: (y - surface.flatBounds.y) * k,
    };

    // The wrapped text is on top: its field is a solid flat box, since the curve is not flat there.
    fireEvent.doubleClick(svg, point);
    expect(services.current!.editor.store.getState().selectedId).toBe("bent");
    expect(editor()).toHaveClass("bg-bg-surface");
    await userEvent.setup().keyboard("{Escape}");

    // The text under it is flat: its field only carries the caret over the stage's own drawing.
    act(() => services.current!.editor.apply((doc) => removeElement(doc, "BODY", "bent")));
    fireEvent.doubleClick(svg, point);
    expect(services.current!.editor.store.getState().selectedId).toBe("flat");
    expect(editor()).toHaveClass("text-transparent");
  });

  it("ignores a double click that is not on a text", async () => {
    const { store: studio } = await designBackend();
    await openStudio(await cupDraft(studio, [textEl("hello", { content: "Chào" })]));
    const svg = document.querySelector<SVGSVGElement>("svg[data-stage-overlay]")!;

    fireEvent.doubleClick(svg, { clientX: 1, clientY: 1 });

    expect(screen.queryByRole("textbox", { name: "Nội dung chữ" })).not.toBeInTheDocument();
  });
});

/** A cup holding one text, selected: its properties are in the context bar. */
async function openWithText(user: UserEvent) {
  const { store: studio } = await designBackend();
  const services = await openStudio(await cupDraft(studio, [textEl("hello")]));
  await showLayers(user);
  await user.click(screen.getByRole("option", { name: /^Chữ/ }));
  return { services };
}

describe("text properties", () => {
  it("offers only allowed fonts and disables italic for Lobster", async () => {
    const user = userEvent.setup();
    const { store: studio } = await designBackend(fontsRestrictedTo(["lobster", "montserrat"]));
    const services = await openStudio(await cupDraft(studio), FONTS);

    await addText(user);
    await user.keyboard("{Escape}");
    // The first allowed font, in the template's order, not the registry's.
    expect(lastText(services).fontCode).toBe("lobster");

    expect(screen.getByRole("button", { name: "In nghiêng" })).toBeDisabled();
    await user.click(screen.getByRole("combobox", { name: /^Phông chữ/ }));
    const list = await screen.findByRole("listbox");
    // A short list needs no visible search field (UX audit S08-13); it stays for the keyboard.
    expect(screen.getByPlaceholderText("Tìm phông chữ…").closest("div")).toHaveClass("sr-only");
    const options = within(list).getAllByRole("option");
    expect(options.map((o) => o.textContent?.trim())).toEqual(["Lobster", "Montserrat"]);
    expect(within(options[1]!).getByText("Montserrat")).toHaveStyle({ fontFamily: "Montserrat" });

    await user.click(within(list).getByRole("option", { name: /Montserrat/ }));
    expect(lastText(services).fontCode).toBe("montserrat");
    expect(screen.getByRole("button", { name: "In nghiêng" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "In nghiêng" }));
    expect(lastText(services).italic).toBe(true);

    // A font without italics drops the flag, so it is not stored for a face that cannot show it.
    await user.click(screen.getByRole("combobox", { name: /^Phông chữ/ }));
    await user.click(await screen.findByRole("option", { name: /Lobster/ }));
    expect(lastText(services)).toMatchObject({ fontCode: "lobster", italic: false });
    expect(screen.getByRole("button", { name: "In nghiêng" })).toBeDisabled();
  });

  it("offers a font only when the registry, the template and GET /design-fonts all have it (BE-18)", async () => {
    const user = userEvent.setup();
    const { store: studio } = await designBackend(fontsRestrictedTo(["lobster", "montserrat"]));
    registerMockRoute("GET", "/design-fonts", () => ({
      status: 200,
      data: {
        success: true,
        data: [
          { code: "lobster", label: "Lobster" },
          { code: "oswald", label: "Oswald" },
        ],
      },
      headers: {},
    }));
    const services = await openStudio(await cupDraft(studio), FONTS);
    await addText(user);
    await user.keyboard("{Escape}");

    await user.click(screen.getByRole("combobox", { name: /^Phông chữ/ }));
    const list = await screen.findByRole("listbox");
    await waitFor(() =>
      expect(
        within(list)
          .getAllByRole("option")
          .map((o) => o.textContent?.trim()),
      ).toEqual(["Lobster"]),
    );
    expect(lastText(services).fontCode).toBe("lobster");
  });

  it("falls back to the registry's fonts when GET /design-fonts fails, without blocking the studio", async () => {
    const user = userEvent.setup();
    const { store: studio } = await designBackend(fontsRestrictedTo(["lobster", "montserrat"]));
    let asked = 0;
    registerMockRoute("GET", "/design-fonts", () => {
      asked += 1;
      return { status: 500, data: { success: false, errorCode: "INTERNAL" }, headers: {} };
    });
    await openStudio(await cupDraft(studio), FONTS);
    await addText(user);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(asked).toBeGreaterThan(0));

    await user.click(screen.getByRole("combobox", { name: /^Phông chữ/ }));
    const list = await screen.findByRole("listbox");
    expect(
      within(list)
        .getAllByRole("option")
        .map((o) => o.textContent?.trim()),
    ).toEqual(["Lobster", "Montserrat"]);
  });

  it.each([[null], [[]]])(
    "offers every registry font when the template lists %j",
    async (codes) => {
      const user = userEvent.setup();
      const { store: studio } = await designBackend(fontsRestrictedTo(codes as string[] | null));
      await openStudio(await cupDraft(studio, [textEl("hello")]), FONTS);
      await showLayers(user);
      await user.click(screen.getByRole("option", { name: /^Chữ/ }));
      await closePanel(user);

      await user.click(screen.getByRole("combobox", { name: /^Phông chữ/ }));

      const options = within(await screen.findByRole("listbox")).getAllByRole("option");
      expect(options.map((o) => o.textContent?.trim())).toEqual([
        "Be Vietnam Pro",
        "Lobster",
        "Montserrat",
      ]);
    },
  );

  it("filters the fonts as the customer types", async () => {
    const user = userEvent.setup();
    const { store: studio } = await designBackend();
    await openStudio(await cupDraft(studio, [textEl("hello")]), MANY_FONTS);
    await showLayers(user);
    await user.click(screen.getByRole("option", { name: /^Chữ/ }));
    await closePanel(user);

    await user.click(screen.getByRole("combobox", { name: /^Phông chữ/ }));
    const search = await screen.findByPlaceholderText("Tìm phông chữ…");
    // The search field is a 44 px touch target (the kit's is 32 px).
    expect(search).toHaveClass("h-11");
    await user.type(search, "lob");

    const options = within(screen.getByRole("listbox")).getAllByRole("option");
    expect(options.map((o) => o.textContent?.trim())).toEqual(["Lobster"]);
  });

  it("sets the size, one undo step even when the typing passes the 6 pt floor", async () => {
    const user = userEvent.setup();
    const { services } = await openWithText(user);

    const size = screen.getByLabelText("Cỡ chữ (pt)");
    await user.clear(size);
    await user.type(size, "36"); // through "3", which is clamped up to 6
    await user.tab();
    expect(lastText(services).sizePt).toBe(36);
    await user.click(undoButton());
    expect(lastText(services).sizePt).toBe(24);
    await user.click(screen.getByRole("button", { name: "Làm lại (Ctrl+Shift+Z)" }));
    expect(lastText(services).sizePt).toBe(36);
  });

  it("sets alignment and weight, and never leaves a text without an alignment", async () => {
    const user = userEvent.setup();
    const { services } = await openWithText(user);

    await user.click(screen.getByRole("radio", { name: "Căn trái" }));
    await user.click(screen.getByRole("button", { name: "In đậm" }));
    expect(lastText(services)).toMatchObject({ align: "left", bold: true });
    // Pressing the chosen alignment again does not deselect it.
    await user.click(screen.getByRole("radio", { name: "Căn trái" }));
    expect(lastText(services).align).toBe("left");
  });

  it("sets letter spacing and line height", async () => {
    const user = userEvent.setup();
    const { services } = await openWithText(user);

    await openMore(user);
    const spacing = screen.getByLabelText("Giãn chữ");
    await user.clear(spacing);
    await user.type(spacing, "0.1");
    const lineHeight = screen.getByLabelText("Giãn dòng");
    await user.clear(lineHeight);
    await user.type(lineHeight, "1.5");
    await user.tab();

    expect(lastText(services)).toMatchObject({ letterSpacingEm: 0.1, lineHeight: 1.5 });
  });

  it("adds and edits an outline, and removes it again", async () => {
    const user = userEvent.setup();
    const { services } = await openWithText(user);

    await openMore(user);
    expect(screen.queryByLabelText("Độ dày viền (mm)")).not.toBeInTheDocument();
    await user.click(screen.getByRole("switch", { name: "Viền chữ" }));
    expect(lastText(services).outline).toEqual({ color: "#2563EB", widthMm: 0.5 });
    const width = screen.getByLabelText("Độ dày viền (mm)");
    await user.clear(width);
    await user.type(width, "1.2");
    await user.tab();
    expect(lastText(services).outline?.widthMm).toBe(1.2);
    const outlineColor = within(screen.getByRole("group", { name: "Màu viền" }));
    await user.click(outlineColor.getByRole("button", { name: /#DC2626/ }));
    expect(lastText(services).outline).toEqual({ color: "#DC2626", widthMm: 1.2 });

    await user.click(screen.getByRole("switch", { name: "Viền chữ" }));
    expect(lastText(services).outline).toBeUndefined();
    await user.click(undoButton());
    expect(lastText(services).outline).toEqual({ color: "#DC2626", widthMm: 1.2 });
  });

  it("sets the colour from a swatch or a hex code, and remembers a custom one", async () => {
    const user = userEvent.setup();
    const { store: studio } = await designBackend();
    const services = await openStudio(await cupDraft(studio, [textEl("hello")]));
    await showLayers(user);
    await user.click(screen.getByRole("option", { name: /^Chữ/ }));
    const colour = await openTextColour(user);

    await user.click(colour.getByRole("button", { name: /#DC2626/ }));
    expect(lastText(services).color).toBe("#DC2626");

    const hex = colour.getByRole("textbox", { name: "Mã màu (#RRGGBB)" });
    await user.clear(hex);
    await user.type(hex, "#ff8800");
    await user.tab();
    expect(lastText(services).color).toBe("#FF8800");
    expect(colour.getByRole("button", { name: "#FF8800" })).toHaveAttribute("aria-pressed", "true");
  });

  it("shows the bend switch on the cup only", async () => {
    const user = userEvent.setup();
    const { store: studio } = await designBackend();
    const services = await openStudio(await cupDraft(studio, [textEl("hello")]));
    await showLayers(user);
    await user.click(screen.getByRole("option", { name: /^Chữ/ }));

    await user.click(screen.getByRole("switch", { name: "Uốn theo thân ly" }));
    expect(lastText(services).wrap).toBe(true);
    // A wrapped text reads horizontally, so it cannot turn (R15).
    await openPosition(user);
    expect(screen.getByLabelText("Góc xoay (°)")).toBeDisabled();
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("switch", { name: "Uốn theo thân ly" }));
    expect(lastText(services).wrap).toBeUndefined();
  });

  it("offers no bend switch on a flat face", async () => {
    const user = userEvent.setup();
    await designBackend();
    await openStudio(MOCK_DESIGN_IDS.draft);
    await showLayers(user);

    await user.click(screen.getByRole("option", { name: "Chữ: Tiệm Bánh Hoa" }));

    expect(screen.getByRole("combobox", { name: /^Phông chữ/ })).toBeInTheDocument();
    expect(screen.queryByRole("switch", { name: "Uốn theo thân ly" })).not.toBeInTheDocument();
  });

  it("keeps a locked text as it is", async () => {
    const user = userEvent.setup();
    const { store: studio } = await designBackend();
    await openStudio(await cupDraft(studio, [textEl("hello", { locked: true })]));
    await showLayers(user);
    await user.click(screen.getByRole("option", { name: /^Chữ/ }));

    expect(screen.getByLabelText("Cỡ chữ (pt)")).toBeDisabled();
    expect(screen.getByRole("combobox", { name: /^Phông chữ/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "In đậm" })).toBeDisabled();
  });

  it("warns about white on kraft", async () => {
    const user = userEvent.setup();
    await designBackend();
    const services = await openStudio(MOCK_DESIGN_IDS.draft);
    await addText(user);
    await user.keyboard("{Escape}");
    const colour = await openTextColour(user);
    const warning = "Giấy kraft không in được màu trắng.";
    expect(screen.queryByText(warning)).not.toBeInTheDocument();

    await user.click(colour.getByRole("button", { name: /#FFFFFF/ }));

    expect(screen.getByText(warning)).toBeInTheDocument();
    expect(services.current!.editor.store.getState().selectedId).not.toBeNull();
    await user.click(colour.getByRole("button", { name: /#000000/ }));
    expect(screen.queryByText(warning)).not.toBeInTheDocument();
  });

  it("does not warn about white on a white paper cup", async () => {
    const user = userEvent.setup();
    const { store: studio } = await designBackend();
    await openStudio(await cupDraft(studio, [textEl("hello")]));
    await showLayers(user);
    await user.click(screen.getByRole("option", { name: /^Chữ/ }));

    const colour = await openTextColour(user);
    await user.click(colour.getByRole("button", { name: /#FFFFFF/ }));

    expect(screen.queryByText("Giấy kraft không in được màu trắng.")).not.toBeInTheDocument();
  });
});

/** A `document.fonts` that answers `load` as `loads` says (ready by default). */
function stubFontSet(loads: (css: string) => Promise<unknown> = async () => []) {
  const listeners = new Set<() => void>();
  const load = vi.fn((css: string, _sample?: string) => loads(css));
  Object.defineProperty(document, "fonts", {
    configurable: true,
    value: {
      load,
      addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
    },
  });
  return { load, loaded: () => listeners.forEach((listener) => listener()) };
}

describe("font loading", () => {
  afterEach(() => {
    Reflect.deleteProperty(document, "fonts");
  });

  it("reports each font's state, and repaints every surface when one arrives", async () => {
    const user = userEvent.setup();
    const { store: studio } = await designBackend();
    let finishLobster: () => void = () => {};
    const fonts = stubFontSet((css) =>
      css.includes("Lobster")
        ? new Promise<unknown>((resolve) => (finishLobster = () => resolve([])))
        : css.includes("Montserrat")
          ? Promise.reject(new Error("offline"))
          : Promise.resolve([]),
    );
    const services = await openStudio(await cupDraft(studio, [textEl("hello")]), FONTS);
    const repainted: string[][] = [];
    services.current!.repaint.subscribe((codes) => repainted.push([...codes]));
    await showLayers(user);
    await user.click(screen.getByRole("option", { name: /^Chữ/ }));
    await closePanel(user);

    await user.click(screen.getByRole("combobox", { name: /^Phông chữ/ }));

    // Opening the list asks for the regular face of every font offered, once each.
    await waitFor(() =>
      expect(within(screen.getByRole("listbox")).getByText("Đang tải…")).toBeVisible(),
    );
    expect(within(screen.getByRole("listbox")).getByText("Không tải được")).toBeVisible();
    const asked = fonts.load.mock.calls.map(([css]) => css);
    for (const family of ["Be Vietnam Pro", "Lobster", "Montserrat"]) {
      expect(asked.some((css) => css.includes(`"${family}"`))).toBe(true);
    }
    expect(fonts.load.mock.calls.every(([, sample]) => sample === "Tiếng Việt")).toBe(true);

    act(() => finishLobster());
    await waitFor(() =>
      expect(within(screen.getByRole("listbox")).queryByText("Đang tải…")).not.toBeInTheDocument(),
    );
    // A face finishing a load repaints the editor canvas and the 3D textures of every surface.
    act(() => fonts.loaded());
    expect(repainted.at(-1)).toEqual(services.current!.surfaces.order);
    expect(services.current!.fontStatus["be-vietnam-pro"]).toBe("ready");
  });
});
