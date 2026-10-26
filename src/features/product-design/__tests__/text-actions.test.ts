import { describe, expect, it, vi } from "vitest";

import { safeBox } from "../components/studio/image-actions";
import {
  allowedFonts,
  clipTextContent,
  editableText,
  isTextFull,
  MAX_TEXT_CHARS,
  finishTextEdit,
  MIN_TEXT_SIZE_PT,
  placeText,
} from "../components/studio/text-actions";
import {
  addElement,
  createEditor,
  createSizer,
  createSurfaces,
  elementOutline,
  emptyDocument,
  MAX_ELEMENTS_PER_SURFACE,
  updateElement,
  type CustomizationTemplate,
  type FontRegistry,
  type TextElement,
} from "../engine";
import { bagM, cup12oz, FONTS, fakeMeasure, textEl } from "../engine/__tests__/fixtures";

const BIG_REGISTRY: FontRegistry = {
  ...FONTS,
  montserrat: { label: "Montserrat", family: "Montserrat", italic: true },
};

const withFonts = (
  template: CustomizationTemplate,
  allowedFontCodes: string[] | null,
): CustomizationTemplate => ({ ...template, allowedFontCodes });

describe("allowedFonts", () => {
  it.each([[null], [[]]])("is every registry font for %j (R30)", (codes) => {
    const fonts = allowedFonts(withFonts(cup12oz, codes), BIG_REGISTRY);

    expect(fonts.map((f) => f.code)).toEqual(["be-vietnam-pro", "lobster", "montserrat"]);
    expect(fonts[0]).toEqual({
      code: "be-vietnam-pro",
      label: "Be Vietnam Pro",
      family: "Be Vietnam Pro",
      italic: true,
    });
  });

  it("is the template's list, in its order, without codes the registry lacks", () => {
    const template = withFonts(cup12oz, ["montserrat", "pacifico", "lobster"]);

    expect(allowedFonts(template, BIG_REGISTRY).map((f) => f.code)).toEqual([
      "montserrat",
      "lobster",
    ]);
  });

  it("is empty when none of the template's fonts is in the registry", () => {
    expect(allowedFonts(withFonts(cup12oz, ["pacifico"]), BIG_REGISTRY)).toEqual([]);
  });
});

function setup(template: CustomizationTemplate = cup12oz, fonts: FontRegistry = FONTS) {
  const editor = createEditor({ template, document: emptyDocument(template) });
  const surfaces = createSurfaces(template);
  const announce = vi.fn();
  const sizer = createSizer(fonts, fakeMeasure);
  const services = { editor, surfaces, sizer, fonts, template, announce };
  const code = editor.store.getState().activeSurface;
  const surface = surfaces.byCode[code]!;
  const texts = () =>
    editor.store
      .getState()
      .document.surfaces[code]!.elements.filter((el): el is TextElement => el.type === "text");
  const insideSafe = (el: TextElement) =>
    elementOutline(el, surface, sizer(el)).every((p) => surface.contains(p, "safe"));
  return { services, editor, surface, texts, insideSafe, announce, code };
}

describe("placeText", () => {
  it("adds the default text centred on the safe area, selected and announced", () => {
    const { services, editor, surface, texts, announce } = setup();

    const id = placeText(services, { sizePt: 24, bold: false });

    const [text] = texts();
    expect(id).toBe(text!.id);
    expect(text).toMatchObject({
      type: "text",
      content: "Nhập chữ",
      fontCode: "be-vietnam-pro",
      sizePt: 24,
      color: "#111111",
      align: "center",
      lineHeight: 1.2,
      letterSpacingEm: 0,
      bold: false,
      italic: false,
      hidden: false,
      locked: false,
      opacity: 1,
    });
    const safe = safeBox(surface);
    expect(text!.placement).toEqual({ u: safe.u, v: safe.v, rotationDeg: 0, scale: 1 });
    expect(editor.store.getState()).toMatchObject({ selectedId: id, tool: "select" });
    expect(announce).toHaveBeenCalledWith("Đã thêm chữ");
  });

  it("takes the preset's weight and the template's first allowed font", () => {
    const { services, texts } = setup(withFonts(cup12oz, ["lobster", "be-vietnam-pro"]));

    placeText(services, { sizePt: 48, bold: true });

    expect(texts()[0]).toMatchObject({ sizePt: 48, bold: true, fontCode: "lobster" });
  });

  it("shrinks a text too big for the safe area until its whole outline is inside", () => {
    const { services, texts, insideSafe } = setup();

    placeText(services, { sizePt: 200, bold: false });

    const [text] = texts();
    expect(text!.sizePt).toBeLessThan(200);
    expect(text!.sizePt).toBeGreaterThanOrEqual(MIN_TEXT_SIZE_PT);
    expect(insideSafe(text!)).toBe(true);
    // As large as fits: a hair more would stick out.
    expect(insideSafe({ ...text!, sizePt: text!.sizePt * 1.02 })).toBe(false);
  });

  it("keeps the text a flat quad (no wrap) and upright", () => {
    const { services, texts } = setup();

    placeText(services, { sizePt: 24, bold: false });

    expect(texts()[0]!.wrap).toBeUndefined();
    expect(texts()[0]!.placement.rotationDeg).toBe(0);
  });

  it("works on a flat face too", () => {
    const { services, texts, insideSafe } = setup(bagM);

    placeText(services, { sizePt: 48, bold: true });

    expect(insideSafe(texts()[0]!)).toBe(true);
  });

  it("adds nothing to a read-only design", () => {
    const { services, editor, texts, announce } = setup();
    editor.setReadOnly(true);

    expect(placeText(services, { sizePt: 24, bold: false })).toBeNull();
    expect(texts()).toEqual([]);
    expect(announce).not.toHaveBeenCalled();
  });

  it("adds nothing when the surface already holds the most it may", () => {
    const { services, editor, texts, announce, code } = setup();
    for (let i = 0; i < MAX_ELEMENTS_PER_SURFACE; i++) {
      editor.apply((doc) => addElement(doc, code, textEl(`t${i}`)));
    }

    expect(placeText(services, { sizePt: 24, bold: false })).toBeNull();
    expect(texts()).toHaveLength(MAX_ELEMENTS_PER_SURFACE);
    expect(announce).not.toHaveBeenCalled();
  });

  it("adds nothing when the template allows none of the registry's fonts", () => {
    const { services, texts } = setup(withFonts(cup12oz, ["pacifico"]));

    expect(placeText(services, { sizePt: 24, bold: false })).toBeNull();
    expect(texts()).toEqual([]);
  });

  it("is one undo step", () => {
    const { services, editor, texts } = setup();

    placeText(services, { sizePt: 24, bold: false });
    editor.undo();

    expect(texts()).toEqual([]);
  });
});

describe("finishTextEdit", () => {
  it("removes a blank text in the undo step of its editing session", () => {
    const { services, editor, texts, code, announce } = setup();
    const id = placeText(services, { sizePt: 24, bold: false })!;
    // Two edits of one session, then the text is left blank.
    editor.apply((doc) => updateElement(doc, code, id, { content: "x" }), { gestureId: "s1" });
    editor.apply((doc) => updateElement(doc, code, id, { content: " \n " }), { gestureId: "s1" });

    finishTextEdit(services, code, id, "s1");

    expect(texts()).toEqual([]);
    expect(announce).toHaveBeenLastCalledWith("Đã xoá phần tử");
    editor.undo();
    expect(texts().map((t) => t.content)).toEqual(["Nhập chữ"]);
  });

  it("keeps a text that has something in it, and does nothing for a text that is gone", () => {
    const { services, editor, texts, code, announce } = setup();
    const id = placeText(services, { sizePt: 24, bold: false })!;
    editor.apply((doc) => updateElement(doc, code, id, { content: " ok " }), { gestureId: "s1" });
    announce.mockClear();

    finishTextEdit(services, code, id, "s1");
    finishTextEdit(services, code, "missing", "s1");

    expect(texts().map((t) => t.content)).toEqual([" ok "]);
    expect(announce).not.toHaveBeenCalled();
  });
});

describe("editableText", () => {
  it("is the text, unless read-only, locked or hidden", () => {
    const { editor, code } = setup();
    const lock = (patch: object) => editor.apply((doc) => updateElement(doc, code, "t", patch));
    editor.apply((doc) => addElement(doc, code, textEl("t")));

    expect(editableText(editor, "t")?.id).toBe("t");
    expect(editableText(editor, "missing")).toBeNull();
    lock({ locked: true });
    expect(editableText(editor, "t")).toBeNull();
    lock({ locked: false, hidden: true });
    expect(editableText(editor, "t")).toBeNull();
    lock({ hidden: false });
    editor.setReadOnly(true);
    expect(editableText(editor, "t")).toBeNull();
  });
});

describe("the length of a text", () => {
  it("is cut to 500 characters, counted as code points (an emoji is one)", () => {
    expect(MAX_TEXT_CHARS).toBe(500);
    expect(clipTextContent("Cà phê")).toBe("Cà phê");
    const long = "🎉".repeat(600) + "x";
    const cut = clipTextContent(long);
    expect([...cut]).toHaveLength(500);
    expect(cut).toBe("🎉".repeat(500));
    expect(cut.length).toBe(1000); // UTF-16 units: a plain maxLength would have cut at 250
  });

  it("says when a text is full", () => {
    expect(isTextFull("x".repeat(499))).toBe(false);
    expect(isTextFull("x".repeat(500))).toBe(true);
  });
});
