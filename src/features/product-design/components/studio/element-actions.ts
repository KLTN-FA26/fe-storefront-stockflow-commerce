import {
  arcOffsetU,
  clampPlacement,
  copySurface,
  duplicateElement,
  removeElement,
  reorderElement,
  surfaceSnapTargets,
  updateElement,
  type DesignDocument,
  type DesignElement,
  type EditorController,
  type Placement,
  type PrintAreaCode,
  type PrintSurface,
} from "../../engine";
import { STUDIO_ANNOUNCEMENTS } from "./studio-announcer";
import type { StudioServices } from "./studio-context";

/**
 * The edits the stage, the keyboard, the Layers list and the Properties panel share. Each one
 * reads the editor's state when it runs and is one undo step unless it is given a `gestureId`.
 */

type Services = Pick<StudioServices, "editor" | "surfaces" | "announce">;

/** The placement scale an element may take, from a handle or the Properties panel. */
export const SCALE_RANGE = { min: 0.05, max: 20 } as const;

/** Degrees in (−180, 180]. */
export function normalizeDeg(deg: number) {
  const turned = ((deg % 360) + 360) % 360;
  return turned > 180 ? turned - 360 : turned;
}

export type Selection = { code: PrintAreaCode; surface: PrintSurface; element: DesignElement };

/** The selected element of the active surface, or `null`. */
export function currentSelection({
  editor,
  surfaces,
}: Pick<Services, "editor" | "surfaces">): Selection | null {
  const { document, activeSurface, selectedId } = editor.store.getState();
  const surface = surfaces.byCode[activeSurface];
  const element = document.surfaces[activeSurface]?.elements.find((el) => el.id === selectedId);
  return surface && element ? { code: activeSurface, surface, element } : null;
}

/** Moving, turning, resizing and deleting need an editable design and an unlocked element. */
export const canTransform = (editor: EditorController, element: DesignElement) =>
  !editor.store.getState().readOnly && !element.locked;

const gesture = (gestureId: string | undefined) =>
  gestureId === undefined ? undefined : { gestureId };

const samePlacement = (a: Placement, b: Placement) =>
  a.u === b.u && a.v === b.v && a.rotationDeg === b.rotationDeg && a.scale === b.scale;

/**
 * Patches one element; `placement` is kept on the surface with `clampPlacement`. A placement equal
 * to the current one is no change (a nudge against the edge records no undo step).
 */
export function patchElement(
  editor: EditorController,
  { code, surface, element }: Selection,
  patch: Partial<DesignElement>,
  gestureId?: string,
) {
  editor.apply((doc) => {
    if (!patch.placement) return updateElement(doc, code, element.id, patch);
    const current = doc.surfaces[code]?.elements.find((el) => el.id === element.id);
    const clamped = clampPlacement(patch.placement, surface);
    const placement =
      current && samePlacement(current.placement, clamped) ? current.placement : clamped;
    return updateElement(doc, code, element.id, { ...patch, placement });
  }, gesture(gestureId));
}

/**
 * The placement moved `dx` mm right and `dy` mm down in the surface's upright frame at the
 * element, as the product reads there. On the cup that is `dx` mm along the circumference at the
 * element's own radius (`u` is arc length at the mid radius, so it moves by `dx · Rm / R`) and
 * `dy` mm down the slant; on a flat face it is `u + dx`, `v + dy`.
 */
function nudgedPlacement(p: Placement, surface: PrintSurface, dx: number, dy: number): Placement {
  return { ...p, u: arcOffsetU(surface, { ...p, scale: 1 }, dx), v: p.v + dy };
}

/** The placement on the visible centre line of the surface across (`u`) or down (`v`). */
export function centredPlacement(p: Placement, surface: PrintSurface, axis: "u" | "v"): Placement {
  const [acrossCentre, downCentre] = surfaceSnapTargets(surface, []);
  return axis === "u" ? { ...p, u: acrossCentre?.u ?? p.u } : { ...p, v: downCentre?.v ?? p.v };
}

/** Nudges the selection (kept on the surface; against the edge it is no change). */
export function nudgeSelection(services: Services, dx: number, dy: number): boolean {
  const selection = currentSelection(services);
  if (!selection || !canTransform(services.editor, selection.element)) return false;
  const placement = nudgedPlacement(selection.element.placement, selection.surface, dx, dy);
  patchElement(services.editor, selection, { placement });
  return true;
}

export function removeSelection(services: Services): boolean {
  const selection = currentSelection(services);
  if (!selection || !canTransform(services.editor, selection.element)) return false;
  services.editor.apply((doc) => removeElement(doc, selection.code, selection.element.id));
  services.announce(STUDIO_ANNOUNCEMENTS.elementRemoved);
  return true;
}

/** A copy just above the selection (kept on the surface), which becomes the selection. */
export function duplicateSelection(services: Services): boolean {
  const { editor } = services;
  const selection = currentSelection(services);
  if (!selection || editor.store.getState().readOnly) return false;
  const { code, surface, element } = selection;
  const copyId = editor.newId();
  editor.apply((doc) => {
    const copied = duplicateElement(doc, code, element.id, copyId);
    const copy = copied.surfaces[code]?.elements.find((el) => el.id === copyId);
    if (!copy) return copied;
    return updateElement(copied, code, copyId, {
      placement: clampPlacement(copy.placement, surface),
    });
  });
  if (editor.store.getState().document.surfaces[code]?.elements.some((el) => el.id === copyId)) {
    editor.select(copyId);
  }
  return true;
}

/** One step up (`+1`, towards the top) or down (`-1`) the z-order. */
export function restackElement(
  editor: EditorController,
  code: PrintAreaCode,
  id: string,
  step: 1 | -1,
) {
  const elements = editor.store.getState().document.surfaces[code]?.elements ?? [];
  const index = elements.findIndex((element) => element.id === id);
  if (index < 0) return;
  editor.apply((doc) => reorderElement(doc, code, id, index + step));
}

export function restackSelection(services: Services, step: 1 | -1): boolean {
  const selection = currentSelection(services);
  if (!selection || services.editor.store.getState().readOnly) return false;
  restackElement(services.editor, selection.code, selection.element.id, step);
  return true;
}

/**
 * Replaces face `to` with a copy of face `from` (background and elements). Each copied element
 * keeps its place relative to the face's width (R55): `u` is mapped proportionally from the
 * source's `u` range onto the target's, `v` is kept, then the placement is kept on `to`. A logo
 * centred on a bag's 260 mm front lands centred on its 120 mm gusset.
 */
export function copyFace(
  { editor, surfaces }: Pick<Services, "editor" | "surfaces">,
  from: PrintAreaCode,
  to: PrintAreaCode,
) {
  const source = surfaces.byCode[from];
  const target = surfaces.byCode[to];
  if (!source || !target) return;
  const [s0, s1] = source.uRange;
  const [t0, t1] = target.uRange;
  const mapU = (u: number) => (s1 === s0 ? t0 : t0 + ((u - s0) * (t1 - t0)) / (s1 - s0));
  editor.apply((doc): DesignDocument => {
    const copied = copySurface(doc, from, to, editor.newId);
    const content = copied.surfaces[to];
    if (copied === doc || !content) return copied;
    const elements = content.elements.map((element) => ({
      ...element,
      placement: clampPlacement({ ...element.placement, u: mapU(element.placement.u) }, target),
    }));
    return { ...copied, surfaces: { ...copied.surfaces, [to]: { ...content, elements } } };
  });
}
