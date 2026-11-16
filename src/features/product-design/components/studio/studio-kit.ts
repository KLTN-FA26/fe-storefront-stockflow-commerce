import {
  createCanvasMeasurer,
  createSurfaces,
  ImageCache,
  type CustomizationTemplate,
  type EditorController,
} from "../../engine";
import { createLivePreview, createRepaintChannel, type ViewerRef } from "./studio-context";
import { pinDocumentImages } from "./use-asset-images";

// What the studio (`useStudioServices`) and a design loaded without it (`loadDesignSession`) both
// build to draw a design: the same kit, and the same words for a design that cannot be opened.

/** Decoded proxy images kept at most, beyond those the document places (a 2048 px proxy is 16 MB). */
const IMAGE_CACHE_BYTES = 256 * 1024 * 1024;

/** Why a design's variant cannot be opened for drawing. */
export const STUDIO_LOAD_MESSAGES = {
  /** It has no print configuration (catalog BR-14). */
  noPrintConfig: "Quy cách này chưa nhận thiết kế.",
  /** Its template is a 3D model: no print surfaces are built for one yet. */
  model3d: "Mẫu 3D của sản phẩm này chưa được hỗ trợ.",
} as const;

/**
 * The drawing kit of `template` around `editor`: its print surfaces, the text measurer, the proxy
 * image cache (the images the editor's document places stay pinned), the layer cache, the repaint
 * channel, the live preview and the 3D viewer's slot (empty until one is shown).
 */
export function createStudioKit(template: CustomizationTemplate, editor: EditorController) {
  const repaint = createRepaintChannel();
  const viewerRef: ViewerRef = { current: null };
  return {
    surfaces: createSurfaces(template),
    measure: createCanvasMeasurer(),
    images: new ImageCache({ maxBytes: IMAGE_CACHE_BYTES, isPinned: pinDocumentImages(editor) }),
    layerCache: new Map<string, CanvasImageSource>(),
    repaint,
    livePreview: createLivePreview(repaint),
    viewerRef,
  };
}
