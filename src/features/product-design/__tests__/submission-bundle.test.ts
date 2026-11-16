import { describe, expect, it, vi } from "vitest";

import type { ExportRenderer } from "../components/studio/export-renderer";
import { buildSubmissionBundle, type BundleStep } from "../components/studio/submission-bundle";
import { createSurfaces, emptyDocument, mmToPx, printDpi } from "../engine";
import { bagM, cup12oz, PNG_1x1 } from "../engine/__tests__/fixtures";

/** Export rendering stands in for the canvases jsdom lacks: every picture is a 1 × 1 PNG. */
const fakeRenderer = () => ({
  preview: vi.fn<ExportRenderer["preview"]>(async () => PNG_1x1),
  printSurface: vi.fn<ExportRenderer["printSurface"]>(async () => [{ png: PNG_1x1, heightPx: 1 }]),
  specSheet: vi.fn<ExportRenderer["specSheet"]>(async () => PNG_1x1),
  release: vi.fn<ExportRenderer["release"]>(),
});

const input = (renderer: ExportRenderer, template = cup12oz) => ({
  name: "Ly giấy logo quán",
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

  it("lets go of the print images even when a surface fails", async () => {
    const renderer = fakeRenderer();
    renderer.printSurface.mockRejectedValue(new Error("canvas"));

    await expect(buildSubmissionBundle(input(renderer))).rejects.toThrow("canvas");

    expect(renderer.release).toHaveBeenCalledTimes(1);
    expect(renderer.specSheet).not.toHaveBeenCalled();
  });
});
