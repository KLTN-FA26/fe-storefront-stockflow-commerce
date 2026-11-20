// The design API of spec 2026-11-09 §4.2 (/api/v1/designs/**; the /v1 prefix lives in API_URL),
// the one module the feature imports it from. Each answer is parsed once, where it is read. Every
// write sends the design's `version` (docs 12 BR-11): a stale one answers 409 CONFLICT. The status is
// checked first (BE-15): a design that is no longer a draft answers 409 DESIGN_NOT_DRAFT whatever
// version the caller holds.

export {
  deleteLibraryItem,
  listProjectLibrary,
  placeFromLibrary,
  saveImageToLibrary,
  saveTextStyle,
  uploadLibraryImage,
} from "./api-library";
export {
  addDesignToProject,
  archiveProject,
  createProject,
  getProject,
  getProjectHistory,
  listProjects,
  openReviewRound,
  recordSetPreflightFailure,
  removeDesignFromProject,
  updateProject,
} from "./api-projects";
export {
  cloneDesign,
  createDesign,
  createRevision,
  deleteDesign,
  getDesign,
  getDesignHistory,
  getDraftCount,
  listDesigns,
  renameDesign,
} from "./api-designs";
export {
  getAssetDownloadUrl,
  getDesignDocument,
  listDesignAssets,
  saveDesignDocument,
  uploadDesignAsset,
} from "./api-document";
export {
  getDesignPrintConfig,
  getPrintConfig,
  printConfigOfSku,
  readProductCustomization,
} from "./api-print-config";
export {
  listDesignQuoteRequests,
  listProjectQuoteRequests,
  requestDesignQuote,
  requestProjectQuote,
} from "./api-quote-requests";
export {
  filesOfSnapshot,
  getArtifactDownloadUrl,
  getDesignSnapshot,
  listDesignFiles,
  readDesignVersion,
  recordPreflightFailure,
  requestReview,
  submitDesign,
  uploadDesignFile,
  uploadDesignFiles,
} from "./api-submission";
