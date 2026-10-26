import type { DesignDocument, DesignElement, SurfaceContent } from "../document/schema";
import type { ElementSizer } from "../geometry/element";
import type { PrintSurface, SurfaceSet } from "../surfaces/types";
import type { CustomizationTemplate, PrintAreaCode } from "../template/schema";

/** Spec §8. Fail blocks confirming (BR-01), warning needs the customer's risk confirmation, info is advice. */
export type PreflightRuleId =
  | "OUTSIDE_PRINT_AREA"
  | "DPI_BELOW_MIN"
  | "FONT_NOT_ALLOWED"
  | "ASSET_INVALID"
  | "EMPTY_DESIGN"
  | "CROSSES_SAFE_AREA"
  | "DPI_LOW"
  | "ON_SEAM"
  | "TOO_THIN"
  | "WHITE_ON_KRAFT"
  | "TOO_MANY_COLORS"
  | "CMYK_CONVERSION";

export type PreflightLevel = "fail" | "warning" | "info";

/**
 * One finding. `surfaceCode` and `elementId` let the panel locate it: element rules carry both,
 * surface rules (background colour, colour count) only the surface, and the document-level
 * `EMPTY_DESIGN` and `CMYK_CONVERSION` neither.
 */
export type PreflightIssue = {
  ruleId: PreflightRuleId;
  level: PreflightLevel;
  message: string;
  surfaceCode?: PrintAreaCode;
  elementId?: string;
};

export type PreflightReport = {
  result: "Pass" | "Warning" | "Fail";
  issues: PreflightIssue[];
};

/** What the engine knows about an uploaded asset, keyed by `assetId`. */
export type PreflightAsset = {
  contentType: string;
  sizeBytes: number;
  status: "ready" | "error";
};

export type PreflightInput = {
  document: DesignDocument;
  template: CustomizationTemplate;
  surfaces: SurfaceSet;
  sizer: ElementSizer;
  assets: Readonly<Record<string, PreflightAsset>>;
  /** Load state per `fontCode`; a font with no entry has not been requested and is not an error. */
  fontStatus: Readonly<Record<string, "ready" | "loading" | "error">>;
};

/** One print surface of the design as the per-surface rules see it. */
export type SurfaceScope = {
  input: PreflightInput;
  code: PrintAreaCode;
  surface: PrintSurface;
  content: SurfaceContent;
  /** Visible elements only: a hidden element is not printed, so no rule applies to it. */
  elements: DesignElement[];
};
