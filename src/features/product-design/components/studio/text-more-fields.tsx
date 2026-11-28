"use client";

import { useId } from "react";

import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

import type { Hex, TextElement } from "../../engine";
import { ColorField } from "./color-field";
import { patchElement, type Selection } from "./element-actions";
import { NumberField } from "./number-field";
import { useStudio } from "./studio-context";
import { DEFAULT_OUTLINE, TEXT_LIMITS } from "./text-actions";

/**
 * What a text keeps in the context bar's "Thêm": its outline (on or off, then its colour and
 * width), letter spacing and line height. Each visit to a number field is one undo step.
 */
export function TextMoreFields({
  target,
  warnOnKraft,
}: {
  target: Selection & { element: TextElement };
  warnOnKraft: boolean;
}) {
  const { editor } = useStudio();
  const outlineId = useId();
  const { element } = target;
  const { outline } = element;
  const patch = (changes: Partial<TextElement>, session?: string) =>
    patchElement(editor, target, changes, session);
  const patchOutline = (changes: Partial<NonNullable<typeof outline>>, session?: string) =>
    outline && patch({ outline: { ...outline, ...changes } }, session);

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={outlineId} className="text-ink-primary min-h-11 flex-1 text-sm">
          Viền chữ
        </Label>
        <Switch
          id={outlineId}
          checked={outline !== undefined}
          onCheckedChange={(on) => patch({ outline: on ? { ...DEFAULT_OUTLINE } : undefined })}
        />
      </div>
      {outline ? (
        <>
          <ColorField
            label="Màu viền"
            value={outline.color}
            warnOnKraft={warnOnKraft}
            onChange={(color: Hex) => patchOutline({ color })}
          />
          <NumberField
            label="Độ dày viền (mm)"
            value={outline.widthMm}
            min={TEXT_LIMITS.outlineMm.min}
            max={TEXT_LIMITS.outlineMm.max}
            step={0.1}
            decimals={2}
            onChange={(widthMm, session) => patchOutline({ widthMm }, session)}
          />
        </>
      ) : null}
      <div className="grid grid-cols-2 gap-3">
        <NumberField
          label="Giãn chữ"
          value={element.letterSpacingEm}
          min={TEXT_LIMITS.letterSpacingEm.min}
          max={TEXT_LIMITS.letterSpacingEm.max}
          step={0.05}
          decimals={2}
          onChange={(letterSpacingEm, session) => patch({ letterSpacingEm }, session)}
        />
        <NumberField
          label="Giãn dòng"
          value={element.lineHeight}
          min={TEXT_LIMITS.lineHeight.min}
          max={TEXT_LIMITS.lineHeight.max}
          step={0.05}
          decimals={2}
          onChange={(lineHeight, session) => patch({ lineHeight }, session)}
        />
      </div>
    </>
  );
}
