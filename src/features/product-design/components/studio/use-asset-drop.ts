"use client";

import type { DragEvent, RefObject } from "react";

import type { PrintAreaCode, RectMm } from "../../engine";
import {
  carriesAsset,
  carriesLibraryItem,
  readDraggedAsset,
  readDraggedLibraryItem,
} from "./asset-drag";
import { placeImage } from "./image-actions";
import { flatPointAt } from "./stage-point";
import { useStudio } from "./studio-context";
import { useLibraryPlacement } from "./use-library-placement";
import { UPLOAD_MESSAGES } from "./use-asset-upload";

/**
 * The stage view's drop target: a tile of the image library (or of the project's library: copied
 * into the design first) dropped on the sheet is placed centred
 * at the point, pulled in as far as its whole outline needs to stay in the safe area. Anything else
 * (a file from the OS included) is left alone, and a read-only design takes nothing. `canvasRef`
 * is the drawn sheet, `bounds` the active face's flat box and `cssPxPerMm` its scale on screen.
 */
export function useAssetDrop({
  canvasRef,
  active,
  bounds,
  cssPxPerMm,
}: {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  active: PrintAreaCode;
  bounds: RectMm | undefined;
  cssPxPerMm: number;
}) {
  const services = useStudio();
  const { editor, surfaces } = services;
  const library = useLibraryPlacement();

  const onDragOver = (event: DragEvent) => {
    const { dataTransfer } = event;
    // A library copy that is still running takes no second drop.
    const takes =
      carriesAsset(dataTransfer) || (carriesLibraryItem(dataTransfer) && !library.pending);
    if (!editor.store.getState().readOnly && takes) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    }
  };
  const onDrop = (event: DragEvent) => {
    const asset = readDraggedAsset(event.dataTransfer);
    const itemId = readDraggedLibraryItem(event.dataTransfer);
    const surface = surfaces.byCode[active];
    const box = canvasRef.current?.getBoundingClientRect();
    if (
      (!asset && !itemId) ||
      !surface ||
      !bounds ||
      !(cssPxPerMm > 0) ||
      editor.store.getState().readOnly
    ) {
      return;
    }
    event.preventDefault();
    const flat = flatPointAt(box, bounds, cssPxPerMm, event.clientX, event.clientY);
    const at = surface.fromFlat(flat.x, flat.y);
    if (asset) {
      if (!placeImage(services, asset, at)) services.announce(UPLOAD_MESSAGES.noRoom);
    } else if (itemId) {
      // The server copies the library image into the design first; then it is placed at the point.
      void library.place(itemId, at).then((problem) => {
        if (problem) services.announce(problem, { urgent: true });
      });
    }
  };
  return { onDragEnter: onDragOver, onDragOver, onDrop };
}
