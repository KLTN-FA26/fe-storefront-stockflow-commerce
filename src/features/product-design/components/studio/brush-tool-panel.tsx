"use client";

import { Plus } from "lucide-react";

import { Alert } from "@/components/shared";
import { Button } from "@/components/ui/button";

import { isKraft, MAX_ELEMENTS_PER_SURFACE } from "../../engine";
import { brushTarget, BRUSH_SIZE_MM, eraserTarget } from "./brush-actions";
import { ColorField } from "./color-field";
import { patchElement } from "./element-actions";
import { surfaceElements } from "./layer-labels";
import { SliderField } from "./slider-field";
import { useEditorState, useStudio } from "./studio-context";

const MESSAGES = {
  nothingToErase: "Mặt này chưa có nét vẽ nào để tẩy. Hãy vẽ trước, rồi dùng Tẩy.",
  full: "Mặt này đã đủ số phần tử tối đa, hãy xoá bớt hoặc chọn một lớp nét vẽ để vẽ tiếp.",
} as const;

/**
 * The options of the Vẽ tool (size "Cỡ bút", colour, opacity) and of the Tẩy tool (only "Cỡ tẩy").
 * Strokes go into the selected drawing, or into a new "Nét vẽ n" when none is selected (the new
 * one becomes the selection, so the next strokes join it; "Tạo lớp vẽ mới" lets go of it). The
 * eraser cuts the selected drawing, else the topmost one of the surface, and only that drawing.
 * Opacity belongs to a drawing as a whole: the slider shows and sets the selected drawing's, and
 * is what a new drawing starts with.
 */
export function BrushToolPanel({ mode }: { mode: "brush" | "eraser" }) {
  const { editor, surfaces, template } = useStudio();
  const readOnly = useEditorState((s) => s.readOnly);
  const code = useEditorState((s) => s.activeSurface);
  const elements = useEditorState(surfaceElements);
  const selectedId = useEditorState((s) => s.selectedId);
  const brush = useEditorState((s) => s.brush);
  const eraser = useEditorState((s) => s.eraser);
  const surface = surfaces.byCode[code];

  if (mode === "eraser") {
    return (
      <div className="flex flex-col gap-4">
        <SliderField
          label="Cỡ tẩy"
          unit="mm"
          value={eraser.sizeMm}
          min={BRUSH_SIZE_MM.min}
          max={BRUSH_SIZE_MM.max}
          step={0.5}
          disabled={readOnly}
          onChange={(sizeMm) => editor.setEraser({ sizeMm })}
        />
        {eraserTarget(elements, selectedId) ? null : (
          <Alert tone="info">{MESSAGES.nothingToErase}</Alert>
        )}
        <p className="text-ink-tertiary text-xs">
          Tẩy chỉ xoá nét vẽ của lớp đang chọn (hoặc lớp nét vẽ trên cùng), không chạm vào ảnh, chữ
          hay nền.
        </p>
      </div>
    );
  }

  const target = brushTarget(elements, selectedId);
  const setOpacity = (percent: number, session: string) => {
    editor.setBrush({ opacity: percent / 100 });
    if (target && surface) {
      patchElement(editor, { code, surface, element: target }, { opacity: percent / 100 }, session);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <SliderField
        label="Cỡ bút"
        unit="mm"
        value={brush.sizeMm}
        min={BRUSH_SIZE_MM.min}
        max={BRUSH_SIZE_MM.max}
        step={0.5}
        disabled={readOnly}
        onChange={(sizeMm) => editor.setBrush({ sizeMm })}
      />
      <ColorField
        label="Màu bút"
        value={brush.color}
        onChange={(color) => editor.setBrush({ color })}
        warnOnKraft={isKraft(template)}
      />
      <SliderField
        label="Độ mờ đục"
        unit="%"
        value={Math.round((target?.opacity ?? brush.opacity) * 100)}
        min={5}
        max={100}
        disabled={readOnly}
        onChange={setOpacity}
      />
      {!target && elements.length >= MAX_ELEMENTS_PER_SURFACE ? (
        <Alert tone="warning">{MESSAGES.full}</Alert>
      ) : null}
      {target ? (
        <Button
          type="button"
          variant="outline"
          className="min-h-11 justify-start rounded-[var(--r-md)] px-3"
          onClick={() => editor.select(null)}
        >
          <Plus aria-hidden className="mr-1.5 size-4" />
          Tạo lớp vẽ mới
        </Button>
      ) : null}
      <p className="text-ink-tertiary text-xs">
        Nét vẽ được thêm vào lớp đang chọn; chưa chọn lớp nét vẽ nào thì tạo lớp mới. Với bút cảm
        ứng lực, nét đậm hay nhạt theo lực nhấn.
      </p>
    </div>
  );
}
