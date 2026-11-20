import { PDFDocument } from "pdf-lib";
import { describe, expect, it, vi } from "vitest";

import type { ExportRenderer } from "../components/studio/export-renderer";
import { buildSubmissionBundle, type BundleStep } from "../components/studio/submission-bundle";
import { createSizer, createSurfaces, emptyDocument, mmToPt, mmToPx, printDpi } from "../engine";
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
  printSheetFace: vi.fn<ExportRenderer["printSheetFace"]>(async () => ({
    content: "",
    images: [],
    alphas: [],
    layers: [],
  })),
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
  it("refuses a file the BE would answer 413 to, before anything is uploaded (SD-14)", async () => {
    // A stand-in limit: the real 50 MB file is not built in a test.
    await expect(
      buildSubmissionBundle({ ...input(fakeRenderer()), maxFileBytes: 10 }),
    ).rejects.toMatchObject({
      name: "Error",
      message: "File in lớn hơn 50 MB, hãy bớt ảnh hoặc giảm độ phân giải.",
    });
    await expect(buildSubmissionBundle(input(fakeRenderer()))).resolves.toBeDefined();
  });

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

  it("draws the preview at 1600 px and each print area once, at the print resolution", async () => {
    const renderer = fakeRenderer();
    const args = input(renderer);

    await buildSubmissionBundle(args);

    expect(renderer.preview).toHaveBeenCalledWith(1600);
    const pxPerMm = mmToPx(1, printDpi(cup12oz.minDpi));
    expect(renderer.printVector).toHaveBeenCalledTimes(args.surfaces.order.length);
    expect(renderer.printSurface).toHaveBeenCalledTimes(args.surfaces.order.length);
    args.surfaces.order.forEach((code, i) => {
      expect(renderer.printSurface).toHaveBeenNthCalledWith(i + 1, code, args.document, pxPerMm);
    });
    expect(renderer.printSheetFace).not.toHaveBeenCalled();
  });

  it("prints a paper bag as one flat sheet with its four sides laid on it (spec 2026-11-18)", async () => {
    const renderer = fakeRenderer();
    const args = input(renderer, bagM);

    const bundle = await buildSubmissionBundle(args);

    const pxPerMm = mmToPx(1, printDpi(bagM.minDpi));
    expect(renderer.printSurface).not.toHaveBeenCalled();
    expect(renderer.printVector).not.toHaveBeenCalled();
    expect(renderer.printSheetFace.mock.calls.map(([code]) => code)).toEqual([
      "FRONT",
      "RIGHT",
      "BACK",
      "LEFT",
    ]);
    // FRONT sits after the 20 mm glue flap, under the 40 mm top fold, both inside the 3 mm bleed;
    // its clip is its trim plus the bleed below it.
    const [, document, scale, front] = renderer.printSheetFace.mock.calls[0]!;
    expect(document).toBe(args.document);
    expect(scale).toBe(pxPerMm);
    expect(front.clipMm).toEqual({ x: 3, y: 3, width: 260, height: 283 });
    expect(front.layerPrefix).toBe("Mặt trước");
    const left = renderer.printSheetFace.mock.calls[3]![3];
    expect(left.clipMm).toEqual({ x: 3, y: 3, width: 123, height: 283 });

    // One page: the sheet's bleed box, 786 × 398 mm.
    const pdf = await PDFDocument.load(bundle.PRINT_READY.bytes);
    expect(pdf.getPageCount()).toBe(1);
    const bleed = pdf.getPage(0).getBleedBox();
    expect(bleed.width).toBeCloseTo(mmToPt(786), 3);
    expect(bleed.height).toBeCloseTo(mmToPt(398), 3);
    const [slug] = renderer.printSlug.mock.lastCall!;
    expect(slug[1]).toContain("Tấm trải phẳng (4 mặt túi) · Trang 1/1 · Thành phẩm 780 × 392 mm");
    expect(slug[1]).toContain("Gấp đáy 72 mm (mép dán, gấp đáy: giả định)");
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
