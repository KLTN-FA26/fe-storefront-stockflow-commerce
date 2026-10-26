/**
 * Public entry of the design engine. Components import the engine only from here; the data layer
 * imports the specific schema modules so the heavier parts never reach the catalog bundles.
 * Test fixtures are not exported.
 */

// Template and print surfaces
export {
  customizationTemplateSchema,
  printAreaCodeSchema,
  type BagModel,
  type CupModel,
  type CustomizationTemplate,
  type MaterialKind,
  type PrintArea,
  type PrintAreaCode,
  type ProductModel,
} from "./template/schema";
export {
  createSurfaces,
  cupSector,
  isCylindricalCup,
  type CupSector,
  type FlatPoint,
  type Guide,
  type PrintSurface,
  type SurfacePoint,
  type SurfaceRegion,
  type SurfaceSet,
} from "./surfaces";

// Design document
export {
  designDocumentSchema,
  hexSchema,
  MAX_DOCUMENT_BYTES,
  MAX_ELEMENTS_PER_SURFACE,
  PATTERN_IDS,
  type Background,
  type DesignDocument,
  type DesignElement,
  type DrawingElement,
  type Hex,
  type ImageElement,
  type PatternId,
  type Placement,
  type Stroke,
  type SurfaceContent,
  type TextElement,
} from "./document/schema";
export { documentByteSize, emptyDocument, emptySurface, migrateDocument } from "./document/factory";
export {
  addElement,
  appendStroke,
  copySurface,
  duplicateElement,
  removeElement,
  reorderElement,
  setBackground,
  setBackgroundAll,
  updateElement,
} from "./document/commands";
export { DocumentHistory } from "./document/history";
export { PRINT_SWATCHES } from "./document/palette";

// Geometry
export {
  applyToPoint,
  IDENTITY,
  invert,
  multiply,
  rotate,
  scale,
  translate,
  type Mat2D,
} from "./geometry/affine";
export {
  arcOffsetU,
  clampPlacement,
  containmentPoints,
  createSizer,
  elementFlip,
  elementMatrix,
  elementOutline,
  hitTest,
  isWrapped,
  wrapStripMatrix,
  type ElementSizer,
  type Flip,
} from "./geometry/element";
export { alongEdges, boundsOf, pointInPolygon } from "./geometry/polygon";
export { simplifyRdp } from "./geometry/simplify";
export type { PathCmd, PointMm, RectMm } from "./geometry/types";
export { effectiveDpi, MM_PER_INCH, mmToPt, mmToPx, ptToMm, pxToMm } from "./geometry/units";

// Rendering
export {
  createCanvasMeasurer,
  FALLBACK_FONT_FAMILY,
  fontCss,
  fontSizePx,
  type FontRegistry,
  type TextMeasurer,
} from "./render/fonts";
export { layoutText, type TextLayout, type TextLine } from "./render/text-layout";
export type { ComposeTarget, DrawOp, Strip, WarpableOp } from "./render/ops";
export { compose, KRAFT_INK_TINT, type ComposeInput } from "./render/compose";
export { WARP_STRIP_COUNT, warpStrips } from "./render/warp";
export { execute, type ChromeColors, type Ctx2D, type RenderEnv } from "./render/execute";
export { drawPattern } from "./render/patterns";
export { strokePolygon } from "./render/brush";
export {
  browserDecode,
  ImageCache,
  PROXY_MAX_EDGE,
  type Decode,
  type DecodedImage,
  type ImageVariant,
  type IsPinned,
} from "./render/image-cache";
export { renderSurface, surfacePx } from "./render/render-surface";

// Uploaded images and SVG logos
export { readImageDimensions, type ImageHeader, type ImageHeaderType } from "./assets/image-header";
export {
  prepareSvg,
  rasterizeSvg,
  svgIntrinsicSize,
  svgRasterSize,
  type SvgSize,
} from "./assets/svg";

// Preflight
export { runPreflight } from "./preflight/run";
export { isKraft, isNearWhite, relativeLuminance } from "./preflight/rules/color";
export {
  dpiTier,
  placedDpi,
  printDpi,
  PRINT_DPI_FLOOR,
} from "./preflight/rules/resolution";
export type {
  PreflightAsset,
  PreflightInput,
  PreflightIssue,
  PreflightLevel,
  PreflightReport,
  PreflightRuleId,
} from "./preflight/types";

// Export
export { canonicalJson, documentChecksum, sha256Hex } from "./export/checksum";
export { buildSpecSummary, specText, type SpecSummary } from "./export/summary";
export { buildPrintPdf, buildSheetPdf, type PrintBand, type PrintPage } from "./export/print-pdf";
export { MAX_BAND_PIXELS, printBands, type BandRows } from "./export/print-bands";
export {
  A4_HEIGHT_MM,
  A4_WIDTH_MM,
  drawSpecSheet,
  type SpecSheetOptions,
} from "./export/spec-sheet";

// Editor
export { snapPlacement, surfaceSnapTargets, type SnapResult, type SnapTarget } from "./editor/snap";
export {
  createEditor,
  MAX_ZOOM,
  MIN_ZOOM,
  type EditorController,
  type EditorState,
  type ToolId,
} from "./editor/controller";
export {
  resolveShortcut,
  type Shortcut,
  type ShortcutAction,
  type ShortcutKeyEvent,
} from "./editor/shortcuts";

// Live 3D preview (three.js enters the barrel only through here)
export { ProductViewer, type ViewerOptions } from "./viewer3d/product-viewer";
export { printUnderlay } from "./viewer3d/materials";
export { isWebGLAvailable } from "./viewer3d/webgl";
