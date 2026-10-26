import { printAreaCodeSchema, type PrintAreaCode } from "../template/schema";
import { emptySurface } from "./factory";
import {
  MAX_ELEMENTS_PER_SURFACE,
  type Background,
  type DesignDocument,
  type DesignElement,
  type Stroke,
  type SurfaceContent,
} from "./schema";

/**
 * Pure document commands. Each returns a new document that shares every untouched surface and
 * element by reference, and returns the *same* document when nothing changes (unknown id or
 * surface, no-op patch, element cap reached), so callers can skip recording a history step with
 * `next === doc`. A surface the document lacks is created, empty, only when a command adds to it.
 */

/** How far a duplicate sits from its source on both axes, in mm. */
const DUPLICATE_OFFSET_MM = 5;

function updateSurface(
  doc: DesignDocument,
  code: PrintAreaCode,
  change: (surface: SurfaceContent) => SurfaceContent,
): DesignDocument {
  const current = doc.surfaces[code] ?? emptySurface();
  const next = change(current);
  if (next === current) return doc;
  return { ...doc, surfaces: { ...doc.surfaces, [code]: next } };
}

function findElement(surface: SurfaceContent, id: string) {
  const index = surface.elements.findIndex((element) => element.id === id);
  const element = surface.elements[index];
  return element ? { index, element } : undefined;
}

function insertAt<T>(items: readonly T[], index: number, item: T): T[] {
  const at = Math.max(0, Math.min(index, items.length));
  return [...items.slice(0, at), item, ...items.slice(at)];
}

function replaceAt<T>(items: readonly T[], index: number, item: T): T[] {
  return items.map((existing, i) => (i === index ? item : existing));
}

/** Add `element` at `index` (default: on top). A full surface is returned unchanged. */
export function addElement(
  doc: DesignDocument,
  code: PrintAreaCode,
  element: DesignElement,
  index?: number,
): DesignDocument {
  return updateSurface(doc, code, (surface) => {
    if (surface.elements.length >= MAX_ELEMENTS_PER_SURFACE) return surface;
    const at = index ?? surface.elements.length;
    return { ...surface, elements: insertAt(surface.elements, at, element) };
  });
}

/**
 * Shallow-merge `patch` into an element. `id` and `type` never change. Setting an optional field
 * (`wrap`, `outline`) to `undefined` removes it, as the optional types allow.
 */
export function updateElement(
  doc: DesignDocument,
  code: PrintAreaCode,
  id: string,
  patch: Partial<DesignElement>,
): DesignDocument {
  return updateSurface(doc, code, (surface) => {
    const found = findElement(surface, id);
    if (!found) return surface;

    const current: Record<string, unknown> = found.element;
    const changes = Object.entries(patch).filter(([key]) => key !== "id" && key !== "type");
    if (changes.every(([key, value]) => Object.is(current[key], value))) return surface;

    const merged = Object.fromEntries(
      Object.entries({ ...current, ...Object.fromEntries(changes) }).filter(
        ([, value]) => value !== undefined,
      ),
    ) as DesignElement;
    return { ...surface, elements: replaceAt(surface.elements, found.index, merged) };
  });
}

export function removeElement(
  doc: DesignDocument,
  code: PrintAreaCode,
  id: string,
): DesignDocument {
  return updateSurface(doc, code, (surface) => {
    const elements = surface.elements.filter((element) => element.id !== id);
    return elements.length === surface.elements.length ? surface : { ...surface, elements };
  });
}

/** Move an element to `toIndex` in z-order (0 = bottom), clamped to the surface. */
export function reorderElement(
  doc: DesignDocument,
  code: PrintAreaCode,
  id: string,
  toIndex: number,
): DesignDocument {
  return updateSurface(doc, code, (surface) => {
    const found = findElement(surface, id);
    if (!found) return surface;
    const to = Math.max(0, Math.min(toIndex, surface.elements.length - 1));
    if (to === found.index) return surface;
    const rest = surface.elements.filter((_, i) => i !== found.index);
    return { ...surface, elements: insertAt(rest, to, found.element) };
  });
}

/** Copy an element just above its source, nudged 5 mm on both axes. A full surface is unchanged. */
export function duplicateElement(
  doc: DesignDocument,
  code: PrintAreaCode,
  id: string,
  newId: string,
): DesignDocument {
  return updateSurface(doc, code, (surface) => {
    const found = findElement(surface, id);
    if (!found || surface.elements.length >= MAX_ELEMENTS_PER_SURFACE) return surface;
    const { u, v } = found.element.placement;
    const copy: DesignElement = {
      ...found.element,
      id: newId,
      placement: {
        ...found.element.placement,
        u: u + DUPLICATE_OFFSET_MM,
        v: v + DUPLICATE_OFFSET_MM,
      },
    };
    return { ...surface, elements: insertAt(surface.elements, found.index + 1, copy) };
  });
}

export function setBackground(
  doc: DesignDocument,
  code: PrintAreaCode,
  background: Background,
): DesignDocument {
  return updateSurface(doc, code, (surface) =>
    surface.background === background ? surface : { ...surface, background },
  );
}

/** Apply one background to every surface the document has. */
export function setBackgroundAll(doc: DesignDocument, background: Background): DesignDocument {
  return printAreaCodeSchema.options.reduce(
    (acc, code) => (acc.surfaces[code] ? setBackground(acc, code, background) : acc),
    doc,
  );
}

/** Replace surface `to` with a copy of `from` (background and elements); `newId` mints each copy's id. */
export function copySurface(
  doc: DesignDocument,
  from: PrintAreaCode,
  to: PrintAreaCode,
  newId: () => string,
): DesignDocument {
  const source = doc.surfaces[from];
  if (!source || from === to) return doc;
  return updateSurface(doc, to, () => ({
    background: source.background,
    elements: source.elements.map((element) => ({ ...element, id: newId() })),
  }));
}

/** Append a stroke to a drawing element; any other kind of element is left alone. */
export function appendStroke(
  doc: DesignDocument,
  code: PrintAreaCode,
  drawingId: string,
  stroke: Stroke,
): DesignDocument {
  return updateSurface(doc, code, (surface) => {
    const found = findElement(surface, drawingId);
    if (found?.element.type !== "drawing") return surface;
    const drawing = { ...found.element, strokes: [...found.element.strokes, stroke] };
    return { ...surface, elements: replaceAt(surface.elements, found.index, drawing) };
  });
}
