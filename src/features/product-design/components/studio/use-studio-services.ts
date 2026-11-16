"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useEffectEvent, useMemo, useRef, useState, type ReactNode } from "react";

import { createSizer, type FontRegistry } from "../../engine";
import { DESIGN_STATUS_META } from "../../lifecycle";
import { templateOf } from "../../selectors";
import type { Design, DesignAsset, DesignDocumentRecord, PrintConfig } from "../../types";
import { createCanvasExportRenderer, type ExportRenderer } from "./export-renderer";
import { STUDIO_ANNOUNCEMENTS, useStudioAnnouncer } from "./studio-announcer";
import type { StudioServices } from "./studio-context";
import { createStudioKit } from "./studio-kit";
import { releaseScratchLayer } from "./studio-paint";
import { useTextEditingState } from "./text-editing";
import { useAssetImages } from "./use-asset-images";
import { useAutosave } from "./use-autosave";
import { useEditor } from "./use-editor";
import { useStatusFollow } from "./use-status-follow";
import { useStudioFonts } from "./use-studio-fonts";

export type StudioWorkspaceProps = {
  design: Design;
  /** The stored document the editor opens with; autosave starts from its version. */
  record: DesignDocumentRecord;
  /** The variant's print configuration: its template, with the limits of its file rules, is the studio's. */
  printConfig: PrintConfig;
  assets: readonly DesignAsset[];
  fonts: FontRegistry;
  productPhoto?: ReactNode;
  onServices?: ((services: StudioServices) => void) | undefined;
  exportRenderer?: ExportRenderer | undefined;
};

/**
 * The loaded studio's editor and everything its panels share (`StudioServices`): the template of
 * the print configuration, the surfaces, images, fonts, autosave, the status follow and the export
 * renderer. A design that is not a DRAFT is read-only (spec §6.4): nothing is saved.
 */
export function useStudioServices(props: StudioWorkspaceProps) {
  const { design, printConfig, fonts } = props;
  // The file rules decide the upload limits, the DPI floor and the formats (ruling R20).
  const template = useMemo(() => templateOf(printConfig), [printConfig]);
  const { status } = design;
  const readOnly = !DESIGN_STATUS_META[status].editable;
  const editor = useEditor({ template, document: props.record.document, readOnly });
  const [kit] = useState(() => createStudioKit(template, editor));
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
  const autosave = useAutosave(design, editor, {
    stored: props.record,
    onSaved: () => announce(STUDIO_ANNOUNCEMENTS.saved),
    readOnly, // never saved; a design that leaves DRAFT shows what is stored
  });
  const { ownMove: ownStatusMove } = useStatusFollow(design);
  const { flush, setVersion, resume, conflict, latestState, storedChecksum } = autosave;
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
        model3d: printConfig.model3d,
        sizer,
        fonts,
        designId: design.id,
        client,
      }),
    [props.exportRenderer, kit, editor, template, printConfig, sizer, fonts, design.id, client],
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
      status,
      readOnly,
      printConfig,
      announce,
      assetStatus,
      retryImages,
      fontStatus: fontState.status,
      layerCache,
      repaint,
      livePreview,
      autosave: { flush, setVersion, resume, conflict, latestState, storedChecksum },
      ownStatusMove,
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
      status,
      readOnly,
      printConfig,
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
      storedChecksum,
      ownStatusMove,
      viewerRef,
      exportRenderer,
    ],
  );
  const reportServices = useEffectEvent((next: StudioServices) => props.onServices?.(next));
  useEffect(() => reportServices(services), [services]);
  // The paints share one composite canvas at module level: let its bitmap go with the studio.
  useEffect(() => releaseScratchLayer, []);

  return { services, autosave, announcement, textEditing, fontsReady: fontState.ready };
}
