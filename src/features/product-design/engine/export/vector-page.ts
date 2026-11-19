import type { PDFDict, PDFDocument, PDFPage, PDFRef } from "pdf-lib";

import { tagSrgb } from "./pdfx";

/**
 * A page's artwork as vectors (`createPdfCanvas`'s `VectorArt`), its images already encoded as PNG:
 * content in page space naming `/VCs`, `/VGs<i>`, `/VIm<i>` and `/VL<i>`.
 */
export type VectorPage = {
  content: string;
  images: Uint8Array[];
  alphas: number[];
  layers: string[];
  /**
   * White ink under the artwork (clear or dark stock): the same shapes recorded as an underlay
   * (`/VWh`, `/VWg<i>`, `/VMk<i>`), each image as the alpha of its picture.
   */
  underlay?: { content: string; alphas: number[]; masks: AlphaMask[] };
};

/** A picture's alpha, row by row, one byte per pixel: the shape of the white ink under it. */
export type AlphaMask = { width: number; height: number; alpha: Uint8Array };

/** The `White` separation and the layer the underlay is drawn on (one each per document). */
export type WhiteInk = { space: PDFRef; layer: PDFRef };

type PdfLib = typeof import("pdf-lib");

/** A page's `/Resources` sub-dictionary `key`, created when the page has none yet. */
export function resourceDict(pdf: PDFDocument, lib: PdfLib, page: PDFPage, key: string): PDFDict {
  const { Resources: resources } = page.node.normalizedEntries();
  const existing = resources.lookupMaybe(lib.PDFName.of(key), lib.PDFDict);
  if (existing) return existing;
  const created = pdf.context.obj({});
  resources.set(lib.PDFName.of(key), created);
  return created;
}

/**
 * Puts `art` on `page` as a content stream of its own (so it comes before anything drawn after
 * it): its images (tagged sRGB), its alphas, the sRGB colour space and one optional-content group
 * per layer, on by default. Returns the layers' groups, in order, for the catalog's `/OCProperties`.
 */
export async function addVectorArt(
  pdf: PDFDocument,
  lib: PdfLib,
  page: PDFPage,
  srgb: PDFRef,
  art: VectorPage,
  white?: WhiteInk,
): Promise<PDFRef[]> {
  const { context } = pdf;
  const { PDFName, PDFHexString } = lib;
  const underlay = white ? art.underlay : undefined;
  const xObjects = resourceDict(pdf, lib, page, "XObject");
  for (const [i, png] of art.images.entries()) {
    const image = await pdf.embedPng(png);
    await tagSrgb(pdf, lib, image, srgb);
    xObjects.set(PDFName.of(`VIm${i}`), image.ref);
  }
  const states = resourceDict(pdf, lib, page, "ExtGState");
  // Over white ink the artwork overprints: its process inks replace each other as usual, and the
  // `White` plate under it is kept (a knockout would print no white exactly where it is needed).
  const overprint = underlay ? { OP: true, op: true } : {};
  art.alphas.forEach((alpha, i) => {
    states.set(
      PDFName.of(`VGs${i}`),
      context.register(context.obj({ Type: "ExtGState", ca: alpha, CA: alpha, ...overprint })),
    );
  });
  resourceDict(pdf, lib, page, "ColorSpace").set(PDFName.of("VCs"), srgb);
  const properties = resourceDict(pdf, lib, page, "Properties");
  const layers = art.layers.map((name, i) => {
    const ref = context.register(context.obj({ Type: "OCG", Name: PDFHexString.fromText(name) }));
    properties.set(PDFName.of(`VL${i}`), ref);
    return ref;
  });
  if (underlay && white) {
    // Drawn first, under the artwork, on its own layer (on: the press prints it).
    underlay.masks.forEach((mask, i) => {
      const { width, height, alpha } = mask;
      const image = { Type: "XObject", Subtype: "Image", Width: width, Height: height };
      const shape = context.register(
        context.flateStream(alpha, { ...image, ColorSpace: "DeviceGray", BitsPerComponent: 8 }),
      );
      const ink = new Uint8Array(width * height).fill(255);
      xObjects.set(
        PDFName.of(`VMk${i}`),
        context.register(
          context.flateStream(ink, {
            ...image,
            ColorSpace: white.space,
            BitsPerComponent: 8,
            SMask: shape,
          }),
        ),
      );
    });
    underlay.alphas.forEach((alpha, i) => {
      states.set(
        PDFName.of(`VWg${i}`),
        context.register(context.obj({ Type: "ExtGState", ca: alpha, CA: alpha })),
      );
    });
    resourceDict(pdf, lib, page, "ColorSpace").set(PDFName.of("VWh"), white.space);
    properties.set(PDFName.of("VWL"), white.layer);
    const content = `/OC /VWL BDC
${underlay.content}
EMC`;
    page.node.addContentStream(context.register(context.flateStream(content)));
  }
  page.node.addContentStream(context.register(context.flateStream(art.content)));
  return layers;
}
