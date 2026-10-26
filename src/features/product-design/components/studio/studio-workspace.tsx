"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useEffectEvent, useMemo, useRef, useState, type ReactNode } from "react";

import { TooltipProvider } from "@/components/ui/tooltip";

import type { DesignCapabilities } from "../../capabilities";
import {
  createCanvasMeasurer,
  createSizer,
  createSurfaces,
  ImageCache,
  type CustomizationTemplate,
  type FontRegistry,
} from "../../engine";
import { deriveUiState, DESIGN_UI_STATE_META } from "../../lifecycle";
import type { DesignAsset, DesignDocumentRecord, DesignDraft } from "../../types";
import { CanvasStage } from "./canvas-stage";
import { ConflictDialog } from "./conflict-dialog";
import { DrawingProperties } from "./drawing-properties";
import { createCanvasExportRenderer, type ExportRenderer } from "./export-renderer";
import { ImageProperties } from "./image-properties";
import { PreflightProvider } from "./preflight-context";
import { PreflightPanel } from "./preflight-panel";
import { PrimaryAction } from "./primary-action";
import type { PropertySections } from "./property-sections";
import { ReadOnlyBanner } from "./read-only-banner";
import { ReviewVoidDialog, useReviewVoidGate } from "./review-void-guard";
import { SidePanel } from "./side-panel";
import { STUDIO_ANNOUNCEMENTS, StudioAnnouncer, useStudioAnnouncer } from "./studio-announcer";
import {
  createLivePreview,
  createRepaintChannel,
  StudioProvider,
  type StudioServices,
  type ViewerRef,
} from "./studio-context";
import { StatusStrip } from "./status-strip";
import { StudioHeader } from "./studio-header";
import { releaseScratchLayer } from "./studio-paint";
import { StudioBodySkeleton } from "./studio-skeleton";
import { SurfaceTabs } from "./surface-tabs";
import { TextEditingProvider, useTextEditingState } from "./text-editing";
import { TextProperties } from "./text-properties";
import { ToolPanel } from "./tool-panel";
import { ToolRail } from "./tool-rail";
import { UnsavedDraftDialog } from "./unsaved-draft-dialog";
import { pinDocumentImages, useAssetImages } from "./use-asset-images";
import { useAutosave } from "./use-autosave";
import { useEditor } from "./use-editor";
import { useStudioFonts } from "./use-studio-fonts";
import { ViewerHost } from "./viewer-host";
import { WorkflowCard } from "./workflow-card";
import { WorkflowProvider, type WorkflowServices } from "./workflow-context";

/** Decoded proxy images kept at most, beyond those the document places (a 2048 px proxy is 16 MB). */
const IMAGE_CACHE_BYTES = 256 * 1024 * 1024;

/** The type sections the Properties panel adds under the common fields. */
const PROPERTY_SECTIONS: PropertySections = {
  image: ImageProperties,
  text: TextProperties,
  drawing: DrawingProperties,
};

export type StudioWorkspaceProps = {
  design: DesignDraft;
  /** The stored document (P3) the editor opens with; autosave starts from its version. */
  record: DesignDocumentRecord;
  template: CustomizationTemplate;
  assets: readonly DesignAsset[];
  fonts: FontRegistry;
  capabilities: DesignCapabilities;
  productPhoto?: ReactNode;
  onServices?: ((services: StudioServices) => void) | undefined;
  exportRenderer?: ExportRenderer | undefined;
};

/** The loaded studio: builds the editor and its services, then lays out header, stage and preview. */
export function StudioWorkspace(props: StudioWorkspaceProps) {
  const { design, template, fonts, capabilities, productPhoto } = props;
  const uiState = deriveUiState(design);
  const editable = DESIGN_UI_STATE_META[uiState].editable;
  const editor = useEditor({ template, document: props.record.document, readOnly: !editable });
  const [kit] = useState(() => {
    const repaint = createRepaintChannel();
    return {
      surfaces: createSurfaces(template),
      measure: createCanvasMeasurer(),
      images: new ImageCache({ maxBytes: IMAGE_CACHE_BYTES, isPinned: pinDocumentImages(editor) }),
      layerCache: new Map<string, CanvasImageSource>(),
      repaint,
      livePreview: createLivePreview(repaint),
      viewerRef: { current: null } as ViewerRef,
    };
  });
  const { surfaces, measure, images, layerCache, repaint, livePreview, viewerRef } = kit;
  const sizer = useMemo(() => createSizer(fonts, measure), [fonts, measure]);
  const assets = useMemo(
    () => new Map(props.assets.map((asset) => [asset.assetId, asset])),
    [props.assets],
  );

  const fontState = useStudioFonts({ fonts, editor, surfaces, repaint });
  const { status: assetStatus, retryFailed: retryImages } = useAssetImages({
    designId: design.id,
    editor,
    assets,
    images,
    repaint,
  });
  const stageRef = useRef<HTMLDivElement>(null);
  const { announcement, announce } = useStudioAnnouncer();
  const reviewGate = useReviewVoidGate(uiState);
  const autosave = useAutosave(design, editor, {
    stored: props.record,
    onSaved: () => announce(STUDIO_ANNOUNCEMENTS.saved),
    holds: reviewGate.holds,
  });
  const { flush, setVersion, resume, conflict, latestState } = autosave;
  const textEditing = useTextEditingState(editor);
  const client = useQueryClient();
  // The review files are drawn on real canvases unless a test hands its own renderer in.
  const exportRenderer = useMemo(
    () =>
      props.exportRenderer ??
      createCanvasExportRenderer({
        ...kit,
        editor,
        template,
        sizer,
        fonts,
        designId: design.id,
        client,
      }),
    [props.exportRenderer, kit, editor, template, sizer, fonts, design.id, client],
  );

  const services = useMemo<StudioServices>(
    () => ({
      editor,
      template,
      surfaces,
      sizer,
      fonts,
      measure,
      images,
      assets,
      design,
      capabilities,
      uiState,
      announce,
      assetStatus,
      retryImages,
      fontStatus: fontState.status,
      layerCache,
      repaint,
      livePreview,
      autosave: { flush, setVersion, resume, conflict, latestState },
      stageRef,
      viewerRef,
      exportRenderer,
    }),
    [
      editor,
      template,
      surfaces,
      sizer,
      fonts,
      measure,
      images,
      assets,
      design,
      capabilities,
      uiState,
      announce,
      assetStatus,
      retryImages,
      fontState.status,
      layerCache,
      repaint,
      livePreview,
      flush,
      setVersion,
      resume,
      conflict,
      latestState,
      viewerRef,
      exportRenderer,
    ],
  );
  const workflow = useMemo<WorkflowServices>(
    () => ({ design, uiState, announce, autosave: { flush, latestState } }),
    [design, uiState, announce, flush, latestState],
  );
  const reportServices = useEffectEvent((next: StudioServices) => props.onServices?.(next));
  useEffect(() => reportServices(services), [services]);
  // The paints share one composite canvas at module level: let its bitmap go with the studio.
  useEffect(() => releaseScratchLayer, []);

  return (
    <StudioProvider value={services}>
      <WorkflowProvider value={workflow}>
        <PreflightProvider>
          <TextEditingProvider value={textEditing}>
            <TooltipProvider>
              <div className="flex h-dvh flex-col">
                <StudioHeader autosave={autosave} action={<PrimaryAction />} />
                {!editable ? (
                  <ReadOnlyBanner state={uiState} />
                ) : uiState !== "editing" ? (
                  <StatusStrip />
                ) : null}
                {!fontState.ready ? (
                  <StudioBodySkeleton />
                ) : (
                  // Desktop only (≥ 1024 px, `DesktopOnlyGate`): rail; tool options over the
                  // workflow card; the 2D stage; and the widest column, the 3D preview over the
                  // side panel. The preview takes three fifths of its column and never less than
                  // 18rem: on a short laptop screen the column scrolls rather than squeeze it.
                  <main className="grid min-h-0 flex-1 grid-cols-[3.5rem_clamp(13rem,20vw,17.5rem)_minmax(17rem,1fr)_minmax(22rem,1.35fr)] gap-3 overflow-hidden p-3">
                    <ToolRail className="self-start" />
                    <div className="flex min-h-0 flex-col gap-3">
                      <ToolPanel />
                      <WorkflowCard className="mt-auto" />
                    </div>
                    <section
                      aria-label="Khung thiết kế"
                      className="bg-bg-surface border-border-default flex min-h-0 flex-col overflow-hidden rounded-[var(--r-lg)] border shadow-[var(--sh-sm)]"
                    >
                      <SurfaceTabs>
                        <CanvasStage />
                      </SurfaceTabs>
                    </section>
                    <div className="flex min-h-0 flex-col gap-3 overflow-y-auto">
                      <ViewerHost productPhoto={productPhoto} className="min-h-[18rem] flex-[3]" />
                      <SidePanel
                        sections={PROPERTY_SECTIONS}
                        check={<PreflightPanel />}
                        onEditText={textEditing.start}
                        className="min-h-[12rem] flex-[2]"
                      />
                    </div>
                  </main>
                )}
                <StudioAnnouncer announcement={announcement} />
                <ConflictDialog open={autosave.state === "conflict"} />
                <UnsavedDraftDialog record={props.record} />
                <ReviewVoidDialog gate={reviewGate} autosave={autosave} />
              </div>
            </TooltipProvider>
          </TextEditingProvider>
        </PreflightProvider>
      </WorkflowProvider>
    </StudioProvider>
  );
}
