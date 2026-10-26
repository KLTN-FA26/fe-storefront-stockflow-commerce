"use client";

import { useEffect, useRef } from "react";

import { RadioGroup } from "@/components/ui/radio-group";

import { drawPattern, PATTERN_IDS, type Hex, type PatternId } from "../../engine";
import {
  PATTERN_NAMES,
  PATTERN_ROTATION_DEG,
  PATTERN_SCALE_MM,
  type PatternBackground,
} from "./background-actions";
import { ColorField } from "./color-field";
import { RadioCard } from "./radio-card";
import { SliderField } from "./slider-field";

/** A preview shows this square of the pattern, at this pitch and resolution. */
const PREVIEW_MM = 48;
const PREVIEW_PITCH_MM = 8;
const PREVIEW_PX_PER_MM = 2;

/** One pattern drawn with the engine's own `drawPattern` on a small canvas (nothing where there is no 2D context). */
function PatternPreview({ patternId, colors }: { patternId: PatternId; colors: [Hex, Hex] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [ground, motif] = colors;
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    ctx.save();
    ctx.scale(PREVIEW_PX_PER_MM, PREVIEW_PX_PER_MM);
    drawPattern(ctx, {
      op: "pattern",
      bounds: { x: 0, y: 0, width: PREVIEW_MM, height: PREVIEW_MM },
      patternId,
      colors: [ground, motif],
      scale: PREVIEW_PITCH_MM,
      rotationDeg: 0,
    });
    ctx.restore();
  }, [patternId, ground, motif]);
  return (
    <canvas
      ref={ref}
      aria-hidden
      width={PREVIEW_MM * PREVIEW_PX_PER_MM}
      height={PREVIEW_MM * PREVIEW_PX_PER_MM}
      className="border-border-default aspect-square w-full rounded-[var(--r-sm)] border"
    />
  );
}

/**
 * The options of a pattern background: the pattern to pick (a grid of previews), its two colours
 * (ground, then motif), the pitch of the motif and the angle the lattice is turned by. Each edit
 * is `onChange` with the new background and, for a slider, the id of the scrub it belongs to.
 */
export function PatternOptions({
  background,
  kraft,
  readOnly,
  onChange,
}: {
  background: PatternBackground;
  kraft: boolean;
  readOnly: boolean;
  onChange: (background: PatternBackground, session?: string) => void;
}) {
  const { patternId, colors, scale, rotationDeg } = background;
  return (
    <div className="flex flex-col gap-4">
      <RadioGroup
        aria-label="Hoạ tiết"
        value={patternId}
        disabled={readOnly}
        onValueChange={(next) => {
          const chosen = PATTERN_IDS.find((id) => id === next);
          if (chosen) onChange({ ...background, patternId: chosen });
        }}
        className="grid-cols-3 gap-2"
      >
        {PATTERN_IDS.map((id) => (
          <RadioCard
            key={id}
            value={id}
            chosen={id === patternId}
            className="flex flex-col gap-1.5 p-1.5"
          >
            <PatternPreview patternId={id} colors={colors} />
            <span className="text-ink-primary px-0.5 pb-0.5 text-xs">{PATTERN_NAMES[id]}</span>
          </RadioCard>
        ))}
      </RadioGroup>
      <ColorField
        label="Màu nền hoạ tiết"
        value={colors[0]}
        onChange={(ground) => onChange({ ...background, colors: [ground, colors[1]] })}
        warnOnKraft={kraft}
      />
      <ColorField
        label="Màu hoạ tiết"
        value={colors[1]}
        onChange={(motif) => onChange({ ...background, colors: [colors[0], motif] })}
        warnOnKraft={kraft}
      />
      <SliderField
        label="Cỡ hoạ tiết"
        unit="mm"
        value={scale}
        min={PATTERN_SCALE_MM.min}
        max={PATTERN_SCALE_MM.max}
        disabled={readOnly}
        onChange={(next, session) => onChange({ ...background, scale: next }, session)}
      />
      <SliderField
        label="Góc xoay hoạ tiết"
        unit="°"
        value={rotationDeg}
        min={PATTERN_ROTATION_DEG.min}
        max={PATTERN_ROTATION_DEG.max}
        disabled={readOnly}
        onChange={(next, session) => onChange({ ...background, rotationDeg: next }, session)}
      />
    </div>
  );
}
