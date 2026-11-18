import type { PDFDocument as PdfDocument, PDFImage, PDFRef } from "pdf-lib";

/**
 * The printing condition a PDF/X file is prepared for: its OutputIntent (ISO 15930-7 §6.2.4).
 * `identifier` is the ICC registry name of the characterization data, `info` the profile's name.
 */
export type OutputCondition = {
  identifier: string;
  condition: string;
  info: string;
  registry: string;
};

/**
 * ISO Coated v2 (ECI), FOGRA39: offset on gloss or matte coated paper. ASSUMPTION (open-question
 * B35, decided with the user 2026-11-18): paper cups print to this generic condition until a printer
 * names its own; the RIP converts from it to the press. The profile ships in `public/print/icc`.
 */
export const ISO_COATED_V2: OutputCondition = {
  identifier: "FOGRA39",
  condition:
    "Offset commercial and specialty printing according to ISO 12647-2:2004/Amd 1, paper type 1 or 2 (gloss or matte coated)",
  info: "ISO Coated v2 (ECI)",
  registry: "http://www.color.org",
};

/** The ICC profiles a print file embeds: the press's (CMYK, 4 channels) and the raster's (sRGB). */
export type PrintProfiles = {
  output: OutputCondition & { icc: Uint8Array };
  rgb: Uint8Array;
};

/** What the document-level PDF/X parts carry. */
export type PdfxInfo = {
  title: string;
  /** 32 hex digits: the trailer `/ID` and the XMP document id (the same file → the same id). */
  documentId: string;
  createdAt: Date;
};

const PRODUCER = "StockFlow Storefront (pdf-lib)";
const CREATOR = "StockFlow Design Studio";
const PDFX_VERSION = "PDF/X-4";
const DOCUMENT_ID = /^[0-9a-f]{32}$/;

type PdfLib = typeof import("pdf-lib");

const xmlEscape = (text: string) => text.replace(/[<>&"']/g, (char) => `&#${char.charCodeAt(0)};`);

/** `2026-11-18T03:04:05Z`: XMP's date, the same instant as the Info dictionary's `D:…Z`. */
const xmpDate = (date: Date) => date.toISOString().replace(/\.\d{3}Z$/, "Z");

const uuidOf = (hex: string) =>
  `uuid:${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;

/** The XMP packet PDF/X-4 requires (§6.7.2): title, dates, trapping, ids and the PDF/X version. */
export function pdfxMetadata(info: PdfxInfo): string {
  const date = xmpDate(info.createdAt);
  const id = uuidOf(info.documentId);
  return `<?xpacket begin="\u{FEFF}" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about=""
    xmlns:dc="http://purl.org/dc/elements/1.1/"
    xmlns:xmp="http://ns.adobe.com/xap/1.0/"
    xmlns:pdf="http://ns.adobe.com/pdf/1.3/"
    xmlns:xmpMM="http://ns.adobe.com/xap/1.0/mm/"
    xmlns:pdfxid="http://www.npes.org/pdfx/ns/id/">
   <dc:format>application/pdf</dc:format>
   <dc:title><rdf:Alt><rdf:li xml:lang="x-default">${xmlEscape(info.title)}</rdf:li></rdf:Alt></dc:title>
   <xmp:CreateDate>${date}</xmp:CreateDate>
   <xmp:ModifyDate>${date}</xmp:ModifyDate>
   <xmp:MetadataDate>${date}</xmp:MetadataDate>
   <xmp:CreatorTool>${CREATOR}</xmp:CreatorTool>
   <pdf:Producer>${PRODUCER}</pdf:Producer>
   <pdf:Trapped>False</pdf:Trapped>
   <xmpMM:DocumentID>${id}</xmpMM:DocumentID>
   <xmpMM:InstanceID>${id}</xmpMM:InstanceID>
   <xmpMM:VersionID>1</xmpMM:VersionID>
   <xmpMM:RenditionClass>default</xmpMM:RenditionClass>
   <pdfxid:GTS_PDFXVersion>${PDFX_VERSION}</pdfxid:GTS_PDFXVersion>
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
}

/**
 * Makes `pdf` a PDF/X-4 document (ISO 15930-7): the Info dictionary (title, dates, `Trapped`), the
 * XMP packet, the CMYK OutputIntent with its profile embedded, and the trailer `/ID`. Pages add
 * their own TrimBox and BleedBox; the saved bytes get their header from `asPdf16`.
 */
export function makePdfx(
  pdf: PdfDocument,
  lib: PdfLib,
  info: PdfxInfo,
  output: PrintProfiles["output"],
): void {
  if (!DOCUMENT_ID.test(info.documentId)) throw new Error("A print PDF needs a 32-hex-digit id");
  const { PDFName, PDFString, PDFHexString, PDFDict } = lib;
  const { context, catalog } = pdf;

  pdf.setTitle(info.title);
  pdf.setProducer(PRODUCER);
  pdf.setCreator(CREATOR);
  pdf.setCreationDate(info.createdAt);
  pdf.setModificationDate(info.createdAt);
  const infoDict = context.lookup(context.trailerInfo.Info, PDFDict);
  infoDict.set(PDFName.of("Trapped"), PDFName.of("False"));
  infoDict.set(PDFName.of("GTS_PDFXVersion"), PDFString.of(PDFX_VERSION));

  // PDF/X keeps the packet readable as is: no filter on the metadata stream. The UTF-8 bytes are
  // copied into this realm's Uint8Array: pdf-lib tells bytes from text with `instanceof`.
  const xmp = new Uint8Array(new TextEncoder().encode(pdfxMetadata(info)));
  const metadata = context.stream(xmp, {
    Type: "Metadata",
    Subtype: "XML",
  });
  catalog.set(PDFName.of("Metadata"), context.register(metadata));

  const profile = context.register(context.flateStream(output.icc, { N: 4 }));
  const intent = context.obj({
    Type: "OutputIntent",
    S: "GTS_PDFX",
    OutputConditionIdentifier: PDFString.of(output.identifier),
    OutputCondition: PDFString.of(output.condition),
    Info: PDFString.of(output.info),
    RegistryName: PDFString.of(output.registry),
    DestOutputProfile: profile,
  });
  catalog.set(PDFName.of("OutputIntents"), context.obj([context.register(intent)]));

  const id = PDFHexString.of(info.documentId);
  context.trailerInfo.ID = context.obj([id, id]);
}

/** Registers the sRGB profile once: `[/ICCBased ref]` for the images to share. */
export function srgbColorSpace(pdf: PdfDocument, lib: PdfLib, icc: Uint8Array): PDFRef {
  const { context } = pdf;
  const profile = context.register(context.flateStream(icc, { N: 3 }));
  return context.register(context.obj([lib.PDFName.of("ICCBased"), profile]));
}

/**
 * pdf-lib writes every PNG as `DeviceRGB`, which PDF/X-4 does not allow beside a CMYK
 * OutputIntent (§6.2.4.3): the image is embedded now and its colour space is the sRGB profile.
 */
export async function tagSrgb(
  pdf: PdfDocument,
  lib: PdfLib,
  image: PDFImage,
  srgb: PDFRef,
): Promise<void> {
  await image.embed();
  const stream = pdf.context.lookup(image.ref);
  if (!(stream instanceof lib.PDFRawStream)) throw new Error("An embedded image is not a stream");
  const { PDFName } = lib;
  if (stream.dict.get(PDFName.of("ColorSpace")) !== PDFName.of("DeviceRGB")) return;
  stream.dict.set(PDFName.of("ColorSpace"), srgb);
}

const HEADER_17 = "%PDF-1.7";
const HEADER_16 = "%PDF-1.6";

/**
 * PDF/X-4 is built on PDF 1.6 (§6.1), but pdf-lib always writes a 1.7 header, whatever the
 * context says. The header is rewritten in place: the same length, so no offset moves.
 */
export function asPdf16(bytes: Uint8Array): Uint8Array {
  const header = new TextDecoder("latin1").decode(bytes.subarray(0, HEADER_17.length));
  if (header !== HEADER_17) throw new Error(`Unexpected PDF header: ${header}`);
  bytes.set(new TextEncoder().encode(HEADER_16), 0);
  return bytes;
}
