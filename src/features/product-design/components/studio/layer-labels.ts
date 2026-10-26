import type { DesignElement, EditorState } from "../../engine";

/** Characters of a text's content shown in its layer name before it is cut with "…". */
const TEXT_LABEL_CHARS = 24;

/** The selected element of the active surface (a stable reference for `useEditorState`). */
export const selectedElement = (s: EditorState): DesignElement | undefined =>
  s.document.surfaces[s.activeSurface]?.elements.find((element) => element.id === s.selectedId);

const NO_ELEMENTS: readonly DesignElement[] = [];

/** The active surface's elements, bottom first (a stable reference for `useEditorState`). */
export const surfaceElements = (s: EditorState): readonly DesignElement[] =>
  s.document.surfaces[s.activeSurface]?.elements ?? NO_ELEMENTS;

function textLabel(content: string) {
  const line = [...content.replace(/\s+/g, " ").trim()];
  if (line.length === 0) return "Chữ";
  const shown =
    line.length > TEXT_LABEL_CHARS
      ? `${line.slice(0, TEXT_LABEL_CHARS - 1).join("")}…`
      : line.join("");
  return `Chữ: ${shown}`;
}

/**
 * The layer names of a surface's elements, index for index: "Ảnh", "Chữ: {content}" (on one line,
 * cut when long) and "Nét vẽ {n}", drawings numbered from the bottom.
 */
export function layerLabels(elements: readonly DesignElement[]): string[] {
  let drawings = 0;
  return elements.map((element) => {
    switch (element.type) {
      case "image":
        return "Ảnh";
      case "text":
        return textLabel(element.content);
      case "drawing":
        drawings += 1;
        return `Nét vẽ ${drawings}`;
    }
  });
}
