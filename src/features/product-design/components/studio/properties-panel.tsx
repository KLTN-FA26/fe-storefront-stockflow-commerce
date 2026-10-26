"use client";

import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  Copy,
  Trash2,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";

import { CopyToFace } from "./copy-to-face";
import {
  centredPlacement,
  duplicateSelection,
  patchElement,
  removeSelection,
} from "./element-actions";
import { layerLabels, selectedElement, surfaceElements } from "./layer-labels";
import { TypeSection, type PropertySections } from "./property-sections";
import { useEditorState, useStudio } from "./studio-context";
import { TransformFields } from "./transform-fields";

const NO_SECTIONS: PropertySections = {};

function CommandButton(props: {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  disabled?: boolean;
}) {
  const { label, icon: Icon, onClick, disabled } = props;
  return (
    <Button
      type="button"
      variant="outline"
      className="min-h-11 justify-start rounded-[var(--r-md)] px-3"
      onClick={onClick}
      disabled={disabled}
    >
      <Icon aria-hidden className="mr-1.5 size-4" />
      {label}
    </Button>
  );
}

/**
 * The selected element's properties: the common fields (`TransformFields`), centring, duplicate
 * and delete, then its type's own section from `sections` (the extension point of the image, text
 * and brush tools). Everything is read-only while the design is; a locked element can still be
 * duplicated and faded. A bag also gets "Sao chép sang mặt khác", with or without a selection.
 */
export function PropertiesPanel({ sections = NO_SECTIONS }: { sections?: PropertySections }) {
  const services = useStudio();
  const code = useEditorState((s) => s.activeSurface);
  const element = useEditorState(selectedElement);
  const elements = useEditorState(surfaceElements);
  const readOnly = useEditorState((s) => s.readOnly);
  const surface = services.surfaces.byCode[code];

  if (!element || !surface) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-ink-tertiary text-sm">
          Chọn một phần tử trên khung vẽ hoặc trong tab Lớp để chỉnh thuộc tính.
        </p>
        <CopyToFace />
      </div>
    );
  }

  const target = { code, surface, element };
  const { placement, locked } = element;
  const centre = (axis: "u" | "v") =>
    patchElement(services.editor, target, {
      placement: centredPlacement(placement, surface, axis),
    });

  return (
    <div className="flex flex-col gap-4">
      <fieldset disabled={readOnly} className="flex min-w-0 flex-col gap-4">
        <legend className="text-ink-primary mb-3 truncate text-sm font-semibold">
          {layerLabels(elements)[elements.indexOf(element)]}
        </legend>
        <TransformFields target={target} />
        <div className="grid grid-cols-2 gap-2">
          <CommandButton
            label="Căn giữa ngang"
            icon={AlignCenterVertical}
            disabled={locked}
            onClick={() => centre("u")}
          />
          <CommandButton
            label="Căn giữa dọc"
            icon={AlignCenterHorizontal}
            disabled={locked}
            onClick={() => centre("v")}
          />
          <CommandButton
            label="Nhân bản"
            icon={Copy}
            onClick={() => duplicateSelection(services)}
          />
          <CommandButton
            label="Xoá"
            icon={Trash2}
            disabled={locked}
            onClick={() => removeSelection(services)}
          />
        </div>
        <TypeSection sections={sections} element={element} code={code} readOnly={readOnly} />
      </fieldset>
      <CopyToFace />
    </div>
  );
}
