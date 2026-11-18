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
};

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
): Promise<PDFRef[]> {
  const { context } = pdf;
  const { PDFName, PDFHexString } = lib;
  const xObjects = resourceDict(pdf, lib, page, "XObject");
  for (const [i, png] of art.images.entries()) {
    const image = await pdf.embedPng(png);
    await tagSrgb(pdf, lib, image, srgb);
    xObjects.set(PDFName.of(`VIm${i}`), image.ref);
  }
  const states = resourceDict(pdf, lib, page, "ExtGState");
  art.alphas.forEach((alpha, i) => {
    states.set(
      PDFName.of(`VGs${i}`),
      context.register(context.obj({ Type: "ExtGState", ca: alpha, CA: alpha })),
    );
  });
  resourceDict(pdf, lib, page, "ColorSpace").set(PDFName.of("VCs"), srgb);
  const properties = resourceDict(pdf, lib, page, "Properties");
  const layers = art.layers.map((name, i) => {
    const ref = context.register(context.obj({ Type: "OCG", Name: PDFHexString.fromText(name) }));
    properties.set(PDFName.of(`VL${i}`), ref);
    return ref;
  });
  page.node.addContentStream(context.register(context.flateStream(art.content)));
  return layers;
}
