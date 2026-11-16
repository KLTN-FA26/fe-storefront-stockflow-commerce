"use client";

import { ArrowDown, ArrowUp, Copy, Ellipsis, Move, SlidersHorizontal, Trash2 } from "lucide-react";
import type { ReactNode } from "react";

import { BarDivider, BarIconButton } from "./bar-controls";
import { BarHint } from "./bar-hint";
import { BarGroup } from "./bar-overflow";
import { BarPopover } from "./bar-popovers";
import { CopyToFace } from "./copy-to-face";
import { DrawingBar } from "./drawing-bar";
import {
  duplicateSelection,
  patchElement,
  removeSelection,
  restackSelection,
} from "./element-actions";
import { ImageBar } from "./image-bar";
import { layerLabels, selectedElement, surfaceElements } from "./layer-labels";
import { TypeSection, type PropertySections } from "./property-sections";
import { SliderField } from "./slider-field";
import { useEditorState, useStudio } from "./studio-context";
import { TextBar } from "./text-bar";
import { TransformFields } from "./transform-fields";
import { BarOverflowContext, useBarOverflow } from "./use-bar-overflow";

/** The type parts of the bar: what the studio passes as `sections`. */
export const BAR_SECTIONS: PropertySections = {
  image: ImageBar,
  text: TextBar,
  drawing: DrawingBar,
};

const NO_SECTIONS: PropertySections = {};

/** No vertical padding: the 3 px focus rings of the 36 px controls sit in the 4 px left of the 44. */
const BAR =
  "bg-bg-surface border-border-default flex h-11 min-w-0 items-center gap-2 overflow-hidden border-b px-3";
const ROW = "m-0 flex w-max shrink-0 items-center gap-2 border-0 p-0";

/**
 * The selected element's properties laid out across one row under the header: its name, its type's
 * own controls (`sections`), then the common ones: position (with centring), opacity, layer order,
 * duplicate, delete and "Sao chép sang mặt khác". `end` sits at the right end (the print-area
 * switcher). When the row is too narrow its groups move into "Thêm", lowest priority first
 * (a status note, copy to another face, layer order, alignment or flips, opacity, wrap,
 * bold/italic), and come back when there is room; nothing is clipped or wrapped. Nothing selected:
 * a one-line hint (`BarHint`). The bar is one root either way, so the end slot keeps its nodes (and
 * the focus of a face just pressed, which drops the selection). Everything is disabled while the
 * design is read-only; a locked element keeps its place, size and angle, but can still be
 * duplicated and faded. The bar needs a `TooltipProvider` above it.
 */
export function ContextBar({
  sections = NO_SECTIONS,
  end,
}: {
  sections?: PropertySections;
  end?: ReactNode;
}) {
  const { surfaces } = useStudio();
  const code = useEditorState((s) => s.activeSurface);
  const element = useEditorState(selectedElement);
  const readOnly = useEditorState((s) => s.readOnly);
  const { section, row, end: endRef, value, showMore, setMore } = useBarOverflow(readOnly);

  return (
    <BarOverflowContext.Provider value={value}>
      <section ref={section} data-bar-section="" aria-label="Thuộc tính phần tử" className={BAR}>
        {element && surfaces.byCode[code] ? (
          <fieldset ref={row} data-bar-row="" disabled={readOnly} className={ROW}>
            <ElementControls sections={sections} />
            {showMore ? (
              <BarPopover
                label="Thêm"
                icon={Ellipsis}
                disabled={readOnly}
                className="w-72"
                contentRef={setMore}
              >
                {null}
              </BarPopover>
            ) : null}
          </fieldset>
        ) : (
          <BarHint />
        )}
        {end ? (
          <div
            ref={endRef}
            data-bar-end=""
            className="ml-auto flex shrink-0 items-center gap-2 pl-2"
          >
            {end}
          </div>
        ) : null}
      </section>
    </BarOverflowContext.Provider>
  );
}

/** The controls of the selected element, in the bar's row (the bar checks there is one). */
function ElementControls({ sections }: { sections: PropertySections }) {
  const services = useStudio();
  const code = useEditorState((s) => s.activeSurface);
  const element = useEditorState(selectedElement);
  const elements = useEditorState(surfaceElements);
  const readOnly = useEditorState((s) => s.readOnly);
  const surface = services.surfaces.byCode[code];
  if (!element || !surface) return null;

  const target = { code, surface, element };
  const index = elements.indexOf(element);
  const opacity = (
    <SliderField
      label="Độ mờ đục"
      value={Math.round(element.opacity * 100)}
      min={0}
      max={100}
      unit="%"
      onChange={(percent, session) =>
        patchElement(services.editor, target, { opacity: percent / 100 }, session)
      }
    />
  );

  return (
    <>
      <span className="text-ink-primary max-w-24 shrink-0 truncate text-sm font-semibold">
        {layerLabels(elements)[index]}
      </span>
      <BarDivider />
      <TypeSection sections={sections} element={element} code={code} readOnly={readOnly} />
      <BarDivider />
      <BarPopover label="Vị trí" icon={Move} text="Vị trí" disabled={readOnly} className="w-72">
        <TransformFields target={target} />
      </BarPopover>
      <BarGroup id="opacity" rank={3} more={opacity}>
        <BarPopover
          label="Độ mờ"
          icon={SlidersHorizontal}
          text="Độ mờ"
          disabled={readOnly}
          className="w-64"
        >
          {opacity}
        </BarPopover>
      </BarGroup>
      <BarDivider />
      <BarGroup id="layers" rank={5}>
        <BarIconButton
          label="Lên lớp"
          disabled={index === elements.length - 1}
          onClick={() => restackSelection(services, 1)}
        >
          <ArrowUp aria-hidden />
        </BarIconButton>
        <BarIconButton
          label="Xuống lớp"
          disabled={index === 0}
          onClick={() => restackSelection(services, -1)}
        >
          <ArrowDown aria-hidden />
        </BarIconButton>
      </BarGroup>
      <BarIconButton label="Nhân bản" onClick={() => duplicateSelection(services)}>
        <Copy aria-hidden />
      </BarIconButton>
      <BarIconButton
        label="Xoá"
        disabled={element.locked}
        onClick={() => removeSelection(services)}
      >
        <Trash2 aria-hidden />
      </BarIconButton>
      <BarGroup id="copy-face" rank={6} more={<CopyToFace />}>
        <CopyToFace compact />
      </BarGroup>
    </>
  );
}
