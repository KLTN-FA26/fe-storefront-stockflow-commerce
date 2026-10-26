"use client";

import { AlignCenter, AlignLeft, AlignRight, Bold, Italic } from "lucide-react";
import { useId } from "react";

import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

import { isKraft, type Hex, type TextElement } from "../../engine";
import { ColorField } from "./color-field";
import { patchElement } from "./element-actions";
import { FontCombobox } from "./font-combobox";
import { NumberField } from "./number-field";
import type { PropertySectionProps } from "./property-sections";
import { useStudio } from "./studio-context";
import {
  allowedFonts,
  DEFAULT_OUTLINE,
  isTextFull,
  MAX_TEXT_CHARS,
  MAX_TEXT_SIZE_PT,
  MIN_TEXT_SIZE_PT,
  TEXT_LIMITS,
} from "./text-actions";

const ALIGNMENTS = [
  { value: "left", label: "Căn trái", icon: AlignLeft },
  { value: "center", label: "Căn giữa", icon: AlignCenter },
  { value: "right", label: "Căn phải", icon: AlignRight },
] as const;

const TOGGLE = "min-h-11 min-w-11 rounded-[var(--r-md)]";

/**
 * The text's own section of the Properties panel: font (only the template's allowed ones), size
 * in pt, colour, alignment, bold and italic (italic only where the font has one), outline,
 * letter spacing, line height and bending around the cup ("Uốn theo thân ly", a cup body's sector
 * only). A locked text keeps all of it as it is.
 */
export function TextProperties({ element, code }: PropertySectionProps<TextElement>) {
  const { editor, surfaces, template, fonts } = useStudio();
  const italicHintId = useId();
  const wrapId = useId();
  const outlineId = useId();
  const surface = surfaces.byCode[code];
  if (!surface) return null;

  const options = allowedFonts(template, fonts);
  const font = fonts[element.fontCode];
  const hasItalic = font?.italic ?? false;
  const kraft = isKraft(template);
  const { outline } = element;
  const target = { code, surface, element };
  const patch = (changes: Partial<TextElement>, session?: string) =>
    patchElement(editor, target, changes, session);
  const patchOutline = (changes: Partial<NonNullable<typeof outline>>, session?: string) =>
    outline && patch({ outline: { ...outline, ...changes } }, session);

  return (
    <fieldset
      disabled={element.locked}
      className="border-border-default flex min-w-0 flex-col gap-3 border-t pt-4"
    >
      <h3 className="text-ink-primary text-sm font-semibold">Chữ</h3>
      {isTextFull(element.content) ? (
        <p role="status" className="text-warning text-sm">
          Chữ đã đạt tối đa {MAX_TEXT_CHARS} ký tự: phần gõ thêm sẽ không được nhận.
        </p>
      ) : null}
      <FontCombobox
        label="Phông chữ"
        value={element.fontCode}
        options={options}
        onChange={(fontCode) =>
          // A face without italics cannot show the flag, so it is not kept.
          patch({ fontCode, italic: fonts[fontCode]?.italic ? element.italic : false })
        }
      />
      <NumberField
        label="Cỡ chữ (pt)"
        value={element.sizePt}
        min={MIN_TEXT_SIZE_PT}
        max={MAX_TEXT_SIZE_PT}
        onChange={(sizePt, session) => patch({ sizePt }, session)}
      />
      <ColorField
        label="Màu chữ"
        value={element.color}
        warnOnKraft={kraft}
        onChange={(color: Hex) => patch({ color })}
      />
      <div className="flex flex-wrap items-center gap-2">
        <ToggleGroup
          type="single"
          variant="outline"
          aria-label="Căn lề"
          value={element.align}
          onValueChange={(align) => {
            // Pressing the chosen alignment again reports "" — keep the one there is.
            if (align) patch({ align: align as TextElement["align"] });
          }}
        >
          {ALIGNMENTS.map(({ value, label, icon: Icon }) => (
            <ToggleGroupItem key={value} value={value} aria-label={label} className={TOGGLE}>
              <Icon aria-hidden />
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <Toggle
          variant="outline"
          aria-label="In đậm"
          pressed={element.bold}
          onPressedChange={(bold) => patch({ bold })}
          className={TOGGLE}
        >
          <Bold aria-hidden />
        </Toggle>
        <Toggle
          variant="outline"
          aria-label="In nghiêng"
          aria-describedby={hasItalic ? undefined : italicHintId}
          pressed={element.italic && hasItalic}
          disabled={!hasItalic}
          onPressedChange={(italic) => patch({ italic })}
          className={TOGGLE}
        >
          <Italic aria-hidden />
        </Toggle>
      </div>
      {hasItalic ? null : (
        <p id={italicHintId} className="text-ink-tertiary text-xs">
          Phông này không có kiểu nghiêng.
        </p>
      )}
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
            warnOnKraft={kraft}
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
          label="Giãn chữ (em)"
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
      {surface.kind === "sector" ? (
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor={wrapId} className="text-ink-primary min-h-11 flex-1 text-sm">
            Uốn theo thân ly
          </Label>
          <Switch
            id={wrapId}
            checked={element.wrap === true}
            onCheckedChange={(wrap) => patch({ wrap: wrap ? true : undefined })}
          />
        </div>
      ) : null}
    </fieldset>
  );
}
