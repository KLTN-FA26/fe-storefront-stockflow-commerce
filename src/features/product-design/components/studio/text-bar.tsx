"use client";

import { AlignCenter, AlignLeft, AlignRight, Bold, Italic } from "lucide-react";
import { useId } from "react";

import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

import { isKraft, type Hex, type TextElement } from "../../engine";
import { BAR_HIT_Y, BarDivider, WrapSwitch } from "./bar-controls";
import { BarGroup, BarMore } from "./bar-overflow";
import { ColorPopover } from "./bar-popovers";
import { patchElement } from "./element-actions";
import { FontCombobox } from "./font-combobox";
import { NumberField } from "./number-field";
import type { PropertySectionProps } from "./property-sections";
import { useStudio } from "./studio-context";
import {
  allowedFonts,
  isTextFull,
  MAX_TEXT_CHARS,
  MAX_TEXT_SIZE_PT,
  MIN_TEXT_SIZE_PT,
} from "./text-actions";
import { SaveTextToProject } from "./project-save-items";
import { TextMoreFields } from "./text-more-fields";

const ALIGNMENTS = [
  { value: "left", label: "Căn trái", icon: AlignLeft },
  { value: "center", label: "Căn giữa", icon: AlignCenter },
  { value: "right", label: "Căn phải", icon: AlignRight },
] as const;

const NO_ITALIC = "Phông này không có kiểu nghiêng.";
const FULL_NOTE = `Chữ đã đạt tối đa ${MAX_TEXT_CHARS} ký tự: phần gõ thêm sẽ không được nhận.`;

const TOGGLE = `h-9 min-w-11 rounded-[var(--r-md)] ${BAR_HIT_Y}`;

/**
 * The text's controls in the context bar: font (only the template's allowed ones), size in pt,
 * colour (popover), bold, italic (only where the font has one), alignment and bending around the
 * cup ("Uốn theo thân ly", a cup body's sector only), with outline, letter spacing and line height
 * behind "Thêm" (`TextMoreFields`; the bar moves its groups there when it is narrow, the note of a
 * full text first). A locked text keeps all of it as it is.
 */
export function TextBar({ element, code, readOnly }: PropertySectionProps<TextElement>) {
  const { editor, surfaces, template, fonts, servedFontCodes } = useStudio();
  const italicHintId = useId();
  const surface = surfaces.byCode[code];
  if (!surface) return null;

  const hasItalic = fonts[element.fontCode]?.italic ?? false;
  const kraft = isKraft(template);
  const { locked } = element;
  const target = { code, surface, element };
  const patch = (changes: Partial<TextElement>, session?: string) =>
    patchElement(editor, target, changes, session);

  return (
    <>
      <fieldset disabled={locked} className="m-0 flex shrink-0 items-center gap-2 border-0 p-0">
        <FontCombobox
          inline
          label="Phông chữ"
          value={element.fontCode}
          options={allowedFonts(template, fonts, servedFontCodes)}
          onChange={(fontCode) =>
            // A face without italics cannot show the flag, so it is not kept.
            patch({ fontCode, italic: fonts[fontCode]?.italic ? element.italic : false })
          }
        />
        <NumberField
          inline
          label="Cỡ chữ (pt)"
          value={element.sizePt}
          min={MIN_TEXT_SIZE_PT}
          max={MAX_TEXT_SIZE_PT}
          onChange={(sizePt, session) => patch({ sizePt }, session)}
        />
        <ColorPopover
          label="Màu chữ"
          value={element.color}
          warnOnKraft={kraft}
          disabled={locked || readOnly}
          onChange={(color: Hex) => patch({ color })}
        />
      </fieldset>
      <BarDivider />
      <BarGroup id="text-style" rank={1} disabled={locked}>
        <Toggle
          variant="outline"
          aria-label="In đậm"
          pressed={element.bold}
          onPressedChange={(bold) => patch({ bold })}
          className={TOGGLE}
        >
          <Bold aria-hidden />
        </Toggle>
        {/* A disabled button takes no pointer: the reason is on its wrapper. */}
        <span title={hasItalic ? undefined : NO_ITALIC} className="shrink-0">
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
        </span>
        {hasItalic ? null : (
          <span id={italicHintId} className="sr-only">
            {NO_ITALIC}
          </span>
        )}
      </BarGroup>
      <BarGroup id="text-align" rank={4} disabled={locked}>
        <ToggleGroup
          type="single"
          variant="outline"
          aria-label="Căn lề"
          value={element.align}
          className="shrink-0"
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
      </BarGroup>
      {isTextFull(element.content) ? (
        // The first to go into "Thêm" (where it reads in full): it never pushes a control out.
        <BarGroup
          id="text-full"
          rank={7}
          more={<p className="text-warning text-xs">{FULL_NOTE}</p>}
        >
          <span role="status" title={FULL_NOTE} className="text-warning shrink-0 text-xs">
            Chữ đã đạt tối đa {MAX_TEXT_CHARS} ký tự.
            <span className="sr-only"> Phần gõ thêm sẽ không được nhận.</span>
          </span>
        </BarGroup>
      ) : null}
      {surface.kind === "sector" ? (
        <BarGroup id="wrap" rank={2} disabled={locked}>
          <WrapSwitch
            checked={element.wrap === true}
            onChange={(wrap) => patch({ wrap: wrap ? true : undefined })}
          />
        </BarGroup>
      ) : null}
      <BarMore disabled={locked}>
        <TextMoreFields target={target} warnOnKraft={kraft} />
        <SaveTextToProject element={element} />
      </BarMore>
    </>
  );
}
