import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { usePreflight } from "../components/studio/use-preflight";
import { StudioProvider, type StudioServices } from "../components/studio/studio-context";
import { addElement, createEditor, createSurfaces, emptyDocument } from "../engine";
import { cup12oz, sizer, textEl } from "../engine/__tests__/fixtures";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const label = textEl("t", {
  content: "Cà phê",
  placement: { u: 170, v: 55, rotationDeg: 0, scale: 1 },
});

/** The hook over a real editor, with the studio services it reads (the others are not needed). */
function setup() {
  const editor = createEditor({ template: cup12oz, document: emptyDocument(cup12oz) });
  let services = {
    editor,
    template: cup12oz,
    surfaces: createSurfaces(cup12oz),
    sizer,
    assetStatus: {},
    fontStatus: {},
  } as StudioServices;
  const wrapper = ({ children }: { children: ReactNode }) => (
    <StudioProvider value={services}>{children}</StudioProvider>
  );
  const view = renderHook(() => usePreflight(), { wrapper });
  return {
    editor,
    report: () => view.result.current,
    /** Changes what the studio hands the hook, as a font or an image arriving does. */
    provide(patch: Partial<StudioServices>) {
      services = { ...services, ...patch };
      view.rerender();
    },
    elapse: (ms: number) => act(() => void vi.advanceTimersByTime(ms)),
    place: () => act(() => editor.apply((doc) => addElement(doc, "BODY", label))),
  };
}

describe("usePreflight", () => {
  it("has the report of the design as it is the moment the studio opens", () => {
    const { report } = setup();

    expect(report().result).toBe("Fail");
    expect(report().issues.map((issue) => issue.ruleId)).toEqual(["EMPTY_DESIGN"]);
  });

  it("recomputes 300 ms after a change, not before", () => {
    const { report, place, elapse } = setup();

    place();
    elapse(299);
    expect(report().result).toBe("Fail");
    elapse(1);
    expect(report().result).toBe("Pass");
    expect(report().issues).toEqual([]);
  });

  it("waits 300 ms after the last of several changes", () => {
    const { editor, report, place, elapse } = setup();

    place();
    elapse(200);
    act(() => editor.apply((doc) => addElement(doc, "BODY", { ...label, id: "second" })));
    elapse(250);
    expect(report().result).toBe("Fail");
    elapse(50);
    expect(report().result).toBe("Pass");
  });

  it("recomputes when what the checks read arrives: a font that failed to load", () => {
    const { report, place, provide, elapse } = setup();
    place();
    elapse(300);
    expect(report().issues).toEqual([]);

    provide({ fontStatus: { [label.fontCode]: "error" } });
    elapse(300);

    expect(report().result).toBe("Fail");
    expect(report().issues.map((issue) => issue.ruleId)).toEqual(["FONT_NOT_ALLOWED"]);
  });

  it("recomputes when an image proves unusable", () => {
    const { editor, report, provide, elapse } = setup();
    const photo = {
      ...label,
      id: "photo",
      type: "image" as const,
      assetId: "asset-1",
      naturalWidthPx: 1200,
      naturalHeightPx: 800,
      widthMm: 60,
      heightMm: 40,
      flipX: false,
      flipY: false,
    };
    act(() => editor.apply((doc) => addElement(doc, "BODY", photo)));
    provide({
      assetStatus: { "asset-1": { contentType: "image/png", sizeBytes: 1, status: "ready" } },
    });
    elapse(300);
    expect(report().issues.map((issue) => issue.ruleId)).not.toContain("ASSET_INVALID");

    provide({
      assetStatus: { "asset-1": { contentType: "image/png", sizeBytes: 1, status: "error" } },
    });
    elapse(300);

    expect(report().issues.map((issue) => issue.ruleId)).toContain("ASSET_INVALID");
  });
});
