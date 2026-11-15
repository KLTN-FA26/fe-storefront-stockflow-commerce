// The design API of spec 2026-11-09 §4.2 (/api/v1/designs/**; the /v1 prefix lives in API_URL),
// the one module the feature imports it from. Each answer is parsed once, where it is read. Every
// write sends the design's `version` (docs 12 BR-11): a stale one answers 409 VERSION_CONFLICT, a
// design in another status 409 INVALID_STATE.

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
  listProjectDesigns,
  listProjects,
  openReviewRound,
  recordSetPreflightFailure,
  removeDesignFromProject,
  updateProject,
  uploadSubmission,
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
  getPrintConfig,
  listDesignFiles,
  recordPreflightFailure,
  submitDesign,
} from "./api-submission";
