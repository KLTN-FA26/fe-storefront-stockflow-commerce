"use client";

import type { DragEvent, RefObject } from "react";

import type { PrintAreaCode, RectMm } from "../../engine";
import { carriesAsset, readDraggedAsset } from "./asset-drag";
import { placeImage } from "./image-actions";
import { flatPointAt } from "./stage-point";
import { useStudio } from "./studio-context";
import { UPLOAD_MESSAGES } from "./use-asset-upload";

/**
 * The stage view's drop target: a tile of the image library dropped on the sheet is placed centred
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

  const onDragOver = (event: DragEvent) => {
    if (!editor.store.getState().readOnly && carriesAsset(event.dataTransfer)) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    }
  };
  const onDrop = (event: DragEvent) => {
    const asset = readDraggedAsset(event.dataTransfer);
    const surface = surfaces.byCode[active];
    const box = canvasRef.current?.getBoundingClientRect();
    if (!asset || !surface || !bounds || !(cssPxPerMm > 0) || editor.store.getState().readOnly) {
      return;
    }
    event.preventDefault();
    const flat = flatPointAt(box, bounds, cssPxPerMm, event.clientX, event.clientY);
    if (!placeImage(services, asset, surface.fromFlat(flat.x, flat.y))) {
      services.announce(UPLOAD_MESSAGES.noRoom);
    }
  };
  return { onDragEnter: onDragOver, onDragOver, onDrop };
}
