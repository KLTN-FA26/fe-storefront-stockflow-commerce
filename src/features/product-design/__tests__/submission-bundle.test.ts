import { describe, expect, it, vi } from "vitest";

import type { ExportRenderer } from "../components/studio/export-renderer";
import { buildSubmissionBundle, type BundleStep } from "../components/studio/submission-bundle";
import { createSizer, createSurfaces, emptyDocument, mmToPx, printDpi } from "../engine";
import { bagM, cup12oz, fakeMeasure, FONTS, PNG_1x1 } from "../engine/__tests__/fixtures";
// The print file needs its colour profiles: jsdom serves no `public/` files.
vi.mock(
  "../components/studio/print-profiles",
  async () => (await import("./print-profiles-stub")).printProfilesStub,
);

/** Export rendering stands in for the canvases jsdom lacks: every picture is a 1 × 1 PNG. */
const fakeRenderer = () => ({
  preview: vi.fn<ExportRenderer["preview"]>(async () => PNG_1x1),
  printSurface: vi.fn<ExportRenderer["printSurface"]>(async () => [{ png: PNG_1x1, heightPx: 1 }]),
  printVector: vi.fn<ExportRenderer["printVector"]>(async () => null),
  printSlug: vi.fn<ExportRenderer["printSlug"]>(async () => PNG_1x1),
  designBrief: vi.fn<ExportRenderer["designBrief"]>(async () => [PNG_1x1]),
  release: vi.fn<ExportRenderer["release"]>(),
});

const input = (renderer: ExportRenderer, template = cup12oz) => ({
  name: "Ly giấy logo quán",
  version: 3,
  sizer: createSizer(FONTS, fakeMeasure),
  fonts: FONTS,
  document: emptyDocument(template),
  template,
  surfaces: createSurfaces(template),
  report: { result: "Pass" as const, issues: [] },
  checksum: "a".repeat(64),
  renderer,
});

describe("buildSubmissionBundle", () => {
  it("returns the three files with their names and types", async () => {
    const bundle = await buildSubmissionBundle(input(fakeRenderer()));

    expect(Object.keys(bundle).toSorted()).toEqual([
      "CUSTOMER_PREVIEW",
      "PRINT_READY",
      "TECHNICAL_SPEC",
    ]);
    expect(bundle.CUSTOMER_PREVIEW).toMatchObject({ name: "preview.png", type: "image/png" });
    expect(bundle.PRINT_READY).toMatchObject({ name: "print-ready.pdf", type: "application/pdf" });
    expect(bundle.TECHNICAL_SPEC).toMatchObject({
      name: "technical-spec.pdf",
      type: "application/pdf",
    });
    expect(bundle.PRINT_READY.bytes.length).toBeGreaterThan(0);
    expect(bundle.TECHNICAL_SPEC.bytes.length).toBeGreaterThan(0);
  });

  it("draws the preview at 1600 px and each surface once, at the print resolution", async () => {
    const renderer = fakeRenderer();
    const args = input(renderer, bagM);

    await buildSubmissionBundle(args);

    expect(renderer.preview).toHaveBeenCalledWith(1600);
    const { order } = args.surfaces;
    expect(order.length).toBeGreaterThan(1);
    expect(renderer.printSurface).toHaveBeenCalledTimes(order.length);
    const pxPerMm = mmToPx(1, printDpi(bagM.minDpi));
    order.forEach((code, i) => {
      expect(renderer.printSurface).toHaveBeenNthCalledWith(i + 1, code, args.document, pxPerMm);
    });
  });

  it("reports preview, then print, then spec", async () => {
    const steps: BundleStep[] = [];

    await buildSubmissionBundle({
      ...input(fakeRenderer()),
      onStep: (step) => {
        if (steps.at(-1) !== step) steps.push(step);
      },
    });

    expect(steps).toEqual(["preview", "print", "spec"]);
  });

  it("prints a clear PET cup with white ink under its art and no cut line", async () => {
    const renderer = fakeRenderer();
    const petCup = {
      ...cup12oz,
      model: { ...cup12oz.model, material: "pet-clear" },
    } as typeof cup12oz;

    const bundle = await buildSubmissionBundle(input(renderer, petCup));

    expect(renderer.printVector).toHaveBeenCalledWith(
      "BODY",
      expect.anything(),
      expect.any(Number),
      { underlay: true },
    );
    const raw = new TextDecoder("latin1").decode(bundle.PRINT_READY.bytes);
    expect(raw).not.toContain("/CutContour CS");
    const [slug] = renderer.printSlug.mock.lastCall!;
    expect(slug[1]).toContain("In lên ly đã thành hình, không bế · Chưa có lớp lót trắng");
  });

  it("lets go of the print images even when a surface fails", async () => {
    const renderer = fakeRenderer();
    renderer.printSurface.mockRejectedValue(new Error("canvas"));

    await expect(buildSubmissionBundle(input(renderer))).rejects.toThrow("canvas");

    expect(renderer.release).toHaveBeenCalledTimes(1);
    expect(renderer.designBrief).not.toHaveBeenCalled();
  });
});
