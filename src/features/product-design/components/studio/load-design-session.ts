import { queryOptions, type QueryClient } from "@tanstack/react-query";

import { retryTransient } from "@/lib/api/retry";

import { listDesignAssets } from "../../api";
import { createEditor, createSizer, type FontRegistry, type PreflightAsset } from "../../engine";
import {
  designDocumentQuery,
  designKeys,
  designPrintConfigQuery,
  designQuery,
} from "../../queries";
import { templateOf } from "../../selectors";
import type { Design, DesignAsset, DesignDocumentRecord, PrintConfig } from "../../types";
import { abortable } from "./deadline";
import { createCanvasExportRenderer, ExportError, type ExportRenderer } from "./export-renderer";
import type { PreviewDeps } from "./preview-export";
import type { FontLoadState } from "./studio-context";
import { createStudioKit, STUDIO_LOAD_MESSAGES } from "./studio-kit";
import { releaseScratchLayer } from "./studio-paint";
import { loadDocumentImages } from "./use-asset-images";
import { settleFaces } from "./use-font-status";
import { documentFacesKey } from "./use-studio-fonts";

/**
 * How long one image or one font face may take to load, like the API client's timeout: past it,
 * it counts as failed (preflight: `ASSET_INVALID`, `FONT_NOT_ALLOWED`) and the load goes on.
 */
export const SESSION_LOAD_DEADLINE_MS = 15_000;

/**
 * One design loaded for a submission without the studio (spec §8): the document it had stored
 * when loaded, in an editor no one edits; the template of its variant's print configuration; its
 * images and fonts loaded, their state settled for preflight; and an export renderer with no viewer
 * on screen, so the preview is drawn offscreen (or flat). Checked and drawn by `run-submission.ts`.
 */
export type DesignSession = Omit<PreviewDeps, "offscreenViewer"> & {
  client: QueryClient;
  design: Design;
  printConfig: PrintConfig;
  /** The stored record the session loaded: its document is the editor's. */
  record: DesignDocumentRecord;
  /** The design's stored images by asset id. */
  assets: ReadonlyMap<string, DesignAsset>;
  /** Load state of the document's images by asset id: preflight's `assets`. */
  assetStatus: Readonly<Record<string, PreflightAsset>>;
  /** The document's fonts by font code, each loaded or failed: preflight's `fontStatus`. */
  fontStatus: Readonly<Record<string, FontLoadState>>;
  exportRenderer: ExportRenderer;
  /** `release()` was called: the session no longer checks or draws. */
  readonly released: boolean;
  /** Lets go of the renderer's images, the decoded images and the layers; once is enough. */
  release(): void;
};

export type DesignSessionOptions = {
  /** Test seam: draws the review files in place of the canvases (jsdom has none). */
  exportRenderer?: ExportRenderer;
  /** Stops the load ("Hủy"): it rejects with the signal's reason and its downloads are aborted. */
  signal?: AbortSignal;
};

/** The design's stored images, read fresh (under the key `useDesignAssets` reads). */
const storedAssetsQuery = (designId: string) =>
  queryOptions({
    queryKey: designKeys.assets(designId),
    queryFn: ({ signal }) => listDesignAssets(designId, signal),
    retry: retryTransient,
    staleTime: 0,
  });

/**
 * Loads one design without the studio: the design, its stored document read fresh, its stored
 * images (listed after the document, so every image it places is listed) and its variant's print
 * configuration, all through the feature's queries; then the images the document places and the
 * faces its text uses, waiting until each has loaded or failed, `SESSION_LOAD_DEADLINE_MS` at most.
 * `fonts` is the studio's registry. A variant without a print configuration, or with a 3D model,
 * cannot be loaded (`ExportError`). Its `.glb` (`printConfig.model3d`) rides in the deps: the preview
 * waits for it before the offscreen viewer shoots.
 */
export async function loadDesignSession(
  client: QueryClient,
  designId: string,
  fonts: FontRegistry,
  { exportRenderer: testRenderer, signal }: DesignSessionOptions = {},
): Promise<DesignSession> {
  const [design, record] = await abortable(
    Promise.all([
      client.fetchQuery(designQuery(designId)),
      client.fetchQuery({ ...designDocumentQuery(designId), staleTime: 0 }),
    ]),
    signal,
  );
  const [printConfig, storedAssets] = await abortable(
    Promise.all([
      client.fetchQuery(designPrintConfigQuery(design)),
      client.fetchQuery(storedAssetsQuery(designId)),
    ]),
    signal,
  );
  if (printConfig === null) throw new ExportError(STUDIO_LOAD_MESSAGES.noPrintConfig);
  if (printConfig.template.model.kind === "gltf") {
    throw new ExportError(STUDIO_LOAD_MESSAGES.model3d);
  }

  // The file rules decide the DPI floor and the formats (ruling R20), as in the studio.
  const template = templateOf(printConfig);
  const { document } = record;
  const editor = createEditor({ template, document });
  const kit = createStudioKit(template, editor);
  const sizer = createSizer(fonts, kit.measure);
  const assets = new Map(storedAssets.map((asset) => [asset.assetId, asset]));
  const deadlineMs = SESSION_LOAD_DEADLINE_MS;
  let assetStatus: Record<string, PreflightAsset>;
  let fontStatus: Readonly<Record<string, FontLoadState>>;
  try {
    [assetStatus, fontStatus] = await abortable(
      Promise.all([
        loadDocumentImages({ client, designId, images: kit.images, assets }, document, {
          deadlineMs,
          signal,
        }),
        settleFaces(documentFacesKey(document, fonts), deadlineMs),
      ]),
      signal,
    );
  } catch (error) {
    kit.images.clear(); // cancelled: what was decoded goes now
    throw error;
  }
  const deps = { ...kit, editor, template, model3d: printConfig.model3d, sizer, fonts };
  const exportRenderer = testRenderer ?? createCanvasExportRenderer({ ...deps, designId, client });

  let released = false;
  return {
    ...deps,
    client,
    design,
    printConfig,
    record,
    assets,
    assetStatus,
    fontStatus,
    exportRenderer,
    get released() {
      return released;
    },
    release() {
      if (released) return;
      released = true;
      exportRenderer.release();
      kit.images.clear();
      kit.layerCache.clear();
      // The preview's paints share the studio's module-level composite canvas.
      releaseScratchLayer();
    },
  };
}
