"use client";

import { Plus } from "lucide-react";
import { useState } from "react";

import { Alert } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

import { useEditorState, useStudio } from "./studio-context";
import {
  allowedFonts,
  DEFAULT_PRESET,
  placeText,
  TEXT_PRESETS,
  type TextPreset,
} from "./text-actions";
import { useTextEditing } from "./text-editing";

const MESSAGES = {
  full: "Mặt này đã đủ số phần tử tối đa, hãy xoá bớt để thêm chữ.",
  noFont: "Mẫu này chưa có phông chữ nào để dùng.",
} as const;

/** How a preset is drawn on its button, so the three read as a title, a subtitle and a note. */
const lookOf = ({ sizePt, bold }: TextPreset) =>
  cn(bold && "font-bold", sizePt >= 48 ? "text-lg" : sizePt >= 24 ? "text-base" : "text-sm");

/**
 * The Text tool's options: "Thêm chữ" adds a text on the active surface and opens it for typing
 * (`placeText`, then the inline editor), and three presets add one at a title, subtitle or note
 * size. Editing an existing text is a double click on the stage or Enter in the Layers list.
 */
export function TextToolPanel() {
  const services = useStudio();
  const { start } = useTextEditing();
  const readOnly = useEditorState((s) => s.readOnly);
  const hasFont = allowedFonts(services.template, services.fonts).length > 0;
  const [message, setMessage] = useState<string | null>(null);

  const add = (preset: TextPreset) => {
    const id = placeText(services, preset);
    setMessage(id === null ? (hasFont ? MESSAGES.full : MESSAGES.noFont) : null);
    if (id !== null) start(id);
  };

  return (
    <div className="flex flex-col gap-4">
      <Button
        type="button"
        className="min-h-11 rounded-[var(--r-md)]"
        disabled={readOnly || !hasFont}
        onClick={() => add(DEFAULT_PRESET)}
      >
        <Plus aria-hidden className="mr-1.5 size-4" />
        Thêm chữ
      </Button>
      <section aria-label="Kiểu chữ có sẵn" className="flex flex-col gap-2">
        <h3 className="text-ink-primary text-sm font-semibold">Kiểu chữ có sẵn</h3>
        {TEXT_PRESETS.map((preset) => (
          <Button
            key={preset.label}
            type="button"
            variant="outline"
            className="min-h-11 justify-between rounded-[var(--r-md)] px-3"
            disabled={readOnly || !hasFont}
            onClick={() => add(preset)}
          >
            <span className={cn("text-ink-primary", lookOf(preset))}>{preset.label}</span>
            <span aria-hidden className="text-ink-tertiary text-xs tabular-nums">
              {preset.sizePt} pt
            </span>
          </Button>
        ))}
      </section>
      {message ? (
        <div role="alert">
          <Alert tone="warning">{message}</Alert>
        </div>
      ) : null}
      <p className="text-ink-tertiary text-xs">
        Nhấp đúp vào chữ trên khung vẽ, hoặc nhấn Enter ở tab Lớp, để sửa nội dung.
      </p>
    </div>
  );
}
