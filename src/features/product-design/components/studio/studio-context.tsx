"use client";

import { createContext, useContext, type ReactNode, type RefObject } from "react";
import { useStore } from "zustand";

import type { AutosaveState } from "../../autosave";
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
import type { Design, DesignAsset, DesignStatus, PrintConfig } from "../../types";
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
 * What the header, the submission and the conflict dialog need from autosave: save what is pending
 * now ("Lưu", Ctrl+S, before a submit); adopt a newer version another write of this tab left (a
 * rename, a submit); start over after a conflict reload with the reloaded record's version and
 * checksum; declare a conflict found elsewhere (R69); the save state right now (`flush` also
 * settles on a failure: this says whether the document was stored); and the checksum of the
 * document this tab last loaded or saved (a stored one that differs was saved elsewhere).
 */
export type AutosaveControls = {
  flush(): Promise<void>;
  setVersion(version: number): void;
  resume(version: number, checksum: string): void;
  conflict(): void;
  latestState(): AutosaveState;
  storedChecksum(): string;
};

/** The 3D view while one is shown (`Viewer3D` sets it): the preview export and the preflight panel use it. */
export type ViewerRef = { current: ProductViewer | null };

/**
 * Everything the studio's panels share, built once the design, its document, its images and its
 * variant's print configuration are loaded.
 */
export type StudioServices = {
  editor: EditorController;
  /** The print configuration's template, file limits from its `fileRules` (`templateOf`). */
  template: CustomizationTemplate;
  surfaces: SurfaceSet;
  sizer: ElementSizer;
  fonts: FontRegistry;
  /**
   * The font codes the BE lists (`GET /design-fonts`, BE-18), `null` until read and when the read
   * failed: the menu then offers the registry's fonts (see `allowedFonts`).
   */
  servedFontCodes: readonly string[] | null;
  measure: TextMeasurer;
  /** Decoded images; the editor view and the 3D textures use the `proxy` variant. */
  images: ImageCache;
  assets: ReadonlyMap<string, DesignAsset>;
  design: Design;
  /** `design.status`: the studio follows it (spec §6.4). */
  status: DesignStatus;
  /** Nothing can be changed (`!DESIGN_STATUS_META[status].editable`): tools hidden, no save. */
  readOnly: boolean;
  /** The variant's print configuration: the template, and what preflight checks of the variant. */
  printConfig: PrintConfig;
  /** Says `message` once in the studio's polite live region; `urgent` (an error) assertively. */
  announce(message: string, options?: { urgent?: boolean }): void;
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
  /**
   * The design is about to move to `status` by a write of this tab that re-reads what goes with
   * the move (a submission): the status follow does not read it all again.
   */
  ownStatusMove(status: DesignStatus): void;
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
