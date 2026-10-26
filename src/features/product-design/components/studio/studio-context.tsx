"use client";

import { createContext, useContext, type ReactNode, type RefObject } from "react";
import { useStore } from "zustand";

import type { AutosaveState } from "../../autosave";
import type { DesignCapabilities } from "../../capabilities";
import type {
  CustomizationTemplate,
  DesignDocument,
  EditorController,
  EditorState,
  ElementSizer,
  FontRegistry,
  ImageCache,
  PreflightAsset,
  PrintAreaCode,
  ProductViewer,
  SurfaceSet,
  TextMeasurer,
} from "../../engine";
import type { DesignUiState } from "../../lifecycle";
import type { DesignAsset, DesignDraft } from "../../types";
import type { ExportRenderer } from "./export-renderer";

export type FontLoadState = "loading" | "ready" | "error";

/** Why a surface is painted again: the document changed (an edit, a drag), or something it shows arrived. */
export type SurfaceChangeCause = "edit" | "repaint";

/**
 * Tells every view of some surfaces to paint again: an image arrived, a font finished loading
 * (`repaint`, the default), or a gesture changed what they show (`edit`, which the 3D textures
 * paint at the cheap interactive size).
 */
export type RepaintChannel = {
  request(codes: readonly PrintAreaCode[], cause?: SurfaceChangeCause): void;
  subscribe(
    listener: (codes: readonly PrintAreaCode[], cause: SurfaceChangeCause) => void,
  ): () => void;
};

export function createRepaintChannel(): RepaintChannel {
  const listeners = new Set<(codes: readonly PrintAreaCode[], cause: SurfaceChangeCause) => void>();
  return {
    request(codes, cause = "repaint") {
      if (codes.length === 0) return;
      for (const listener of [...listeners]) listener(codes, cause);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}

/**
 * A document the views paint in place of the editor's while a gesture is under way and not yet
 * committed: a brush stroke as it is drawn. It is not an edit (no undo step, no autosave, no
 * preflight) and goes with `show(null, …)`. `code` is the surface the change is on.
 */
export type LivePreview = {
  readonly document: DesignDocument | null;
  show(document: DesignDocument | null, code: PrintAreaCode): void;
};

export function createLivePreview(repaint: RepaintChannel): LivePreview {
  let shown: DesignDocument | null = null;
  return {
    get document() {
      return shown;
    },
    show(document, code) {
      shown = document;
      repaint.request([code], "edit");
    },
  };
}

/**
 * What the workflow steps need from autosave: save what is pending now; adopt a newer version the
 * caller knows leaves the stored document as it was (a review request it checked); start over
 * after a conflict reload with the reloaded record's version and checksum; declare a conflict
 * found elsewhere (R69); and the save state right now (`flush` also settles on a failure: this
 * says whether the document was stored).
 */
export type AutosaveControls = {
  flush(): Promise<void>;
  setVersion(version: number): void;
  resume(version: number, checksum: string): void;
  conflict(): void;
  latestState(): AutosaveState;
};

/** The 3D view while one is shown (`Viewer3D` sets it): the preview export and the preflight panel use it. */
export type ViewerRef = { current: ProductViewer | null };

/** Everything the studio's panels share, built once the design, document and template are loaded. */
export type StudioServices = {
  editor: EditorController;
  template: CustomizationTemplate;
  surfaces: SurfaceSet;
  sizer: ElementSizer;
  fonts: FontRegistry;
  measure: TextMeasurer;
  /** Decoded images; the editor view and the 3D textures use the `proxy` variant. */
  images: ImageCache;
  assets: ReadonlyMap<string, DesignAsset>;
  design: DesignDraft;
  capabilities: DesignCapabilities;
  uiState: DesignUiState;
  /** Says `message` once in the studio's polite live region. */
  announce(message: string): void;
  /** Load state of the document's images by asset id: preflight's `assets` (ASSET_INVALID). */
  assetStatus: Readonly<Record<string, PreflightAsset>>;
  /** Tries the images that failed to load once more ("Tải lại ảnh"). */
  retryImages(): void;
  /** Load state of the document's fonts by font code: preflight's `fontStatus`. */
  fontStatus: Readonly<Record<string, FontLoadState>>;
  /** Rasterised wrapped elements over the proxy images (the print export keeps its own). */
  layerCache: Map<string, CanvasImageSource>;
  repaint: RepaintChannel;
  livePreview: LivePreview;
  autosave: AutosaveControls;
  /** The stage's container (set by `CanvasStage`): where the keyboard shortcuts and paste are heard. */
  stageRef: RefObject<HTMLDivElement | null>;
  viewerRef: ViewerRef;
  /** Draws the files sent for review; tests supply PNG bytes (jsdom has no canvas). */
  exportRenderer: ExportRenderer;
};

const StudioContext = createContext<StudioServices | null>(null);

export function StudioProvider({
  value,
  children,
}: {
  value: StudioServices;
  children: ReactNode;
}) {
  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>;
}

export function useStudio(): StudioServices {
  const services = useContext(StudioContext);
  if (!services) throw new Error("useStudio must be used inside <StudioProvider>");
  return services;
}

/** A slice of the editor state; the component re-renders only when the slice changes (`Object.is`). */
export function useEditorState<T>(selector: (state: EditorState) => T): T {
  return useStore(useStudio().editor.store, selector);
}

/**
 * Calls `listener` with the surfaces that need painting again: `edit` for a document change (one
 * per frame while dragging), `repaint` when an image or a font arrived. Returns the unsubscribe.
 */
export function subscribeSurfaceChanges(
  { editor, repaint }: Pick<StudioServices, "editor" | "repaint">,
  listener: (codes: readonly PrintAreaCode[], cause: SurfaceChangeCause) => void,
): () => void {
  const offEdit = editor.onDocumentChange((_doc, changed) => listener(changed, "edit"));
  const offRepaint = repaint.subscribe(listener);
  return () => {
    offEdit();
    offRepaint();
  };
}
