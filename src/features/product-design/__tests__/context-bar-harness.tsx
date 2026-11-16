import type { ReactNode } from "react";
import { vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import { renderWithProviders } from "@/test/render";

import { BAR_SECTIONS, ContextBar } from "../components/studio/context-bar";
import { StudioProvider, type StudioServices } from "../components/studio/studio-context";
import {
  addElement,
  createEditor,
  createSurfaces,
  emptyDocument,
  type CustomizationTemplate,
  type DesignElement,
  type EditorController,
  type ImageElement,
  type PrintAreaCode,
  type TextElement,
} from "../engine";
import { cup12oz, FONTS } from "../engine/__tests__/fixtures";

export type Harness = {
  editor: EditorController;
  code: PrintAreaCode;
  /** The studio's live region, as the bar's controls speak to it. */
  announce: ReturnType<typeof vi.fn>;
};

/**
 * The bar over a real editor holding `elements` on the template's first print area, the first
 * element selected. The bar reads only these services (the rest of the studio is not mounted).
 */
export function renderBar(
  elements: DesignElement[],
  opts: {
    template?: CustomizationTemplate;
    readOnly?: boolean;
    end?: ReactNode;
    selected?: string | null;
  } = {},
): Harness {
  const template = opts.template ?? cup12oz;
  const code = template.printAreas[0]!.code;
  const document = elements.reduce(
    (doc, element) => addElement(doc, code, element),
    emptyDocument(template),
  );
  const editor = createEditor({ template, document, newId: () => "copy-1" });
  editor.setActiveSurface(code);
  if (opts.selected !== null) editor.select(opts.selected ?? elements[0]!.id);
  if (opts.readOnly) editor.setReadOnly(true);
  // Only what the bar and its fields read; the cast stands in for the rest of the studio.
  const announce = vi.fn();
  const services = {
    editor,
    template,
    surfaces: createSurfaces(template),
    fonts: FONTS,
    announce,
    design: { id: "design-1" },
  } as unknown as StudioServices;
  renderWithProviders(
    <StudioProvider value={services}>
      <TooltipProvider>
        <ContextBar sections={BAR_SECTIONS} {...(opts.end ? { end: opts.end } : {})} />
      </TooltipProvider>
    </StudioProvider>,
  );
  return { editor, code, announce };
}

export const elementsOf = ({ editor, code }: Harness) =>
  editor.store.getState().document.surfaces[code]!.elements;
export const textOf = (h: Harness) => elementsOf(h)[0] as TextElement;
export const imageOf = (h: Harness) => elementsOf(h)[0] as ImageElement;
