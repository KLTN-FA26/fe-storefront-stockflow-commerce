import type { DesignElement, SurfaceContent } from "../document/schema";

/** How long a text's own words may run in its layer name. */
const TEXT_IN_NAME = 28;

/** The layer name of an element: its number on the page (as the design brief counts) and what it is. */
export function elementLayerName(el: DesignElement, number: number): string {
  switch (el.type) {
    case "image":
      return `${number} · Ảnh / logo`;
    case "drawing":
      return `${number} · Nét vẽ tay`;
    case "text": {
      const words = el.content.replace(/\s+/g, " ").trim();
      const shown = words.length > TEXT_IN_NAME ? `${words.slice(0, TEXT_IN_NAME - 1)}…` : words;
      return `${number} · Chữ “${shown}”`;
    }
  }
}

/**
 * The print layer of each op `compose` makes for `content` (target "print"), by op index: the
 * background is "Nền", each visible element its own numbered layer; the clip and the state ops
 * belong to none. `compose` emits `save, clip, background?, ...elements, restore` (see its tests).
 */
export function printLayerNames(content: SurfaceContent): (string | undefined)[] {
  const names: (string | undefined)[] = [undefined, undefined];
  if (content.background.kind !== "none") names.push("Nền");
  content.elements
    .filter((el) => !el.hidden)
    .forEach((el, i) => names.push(elementLayerName(el, i + 1)));
  return names;
}
