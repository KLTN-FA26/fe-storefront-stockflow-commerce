"use client";

import { useId } from "react";

import { isWrapped, type Placement } from "../../engine";
import { normalizeDeg, patchElement, SCALE_RANGE, type Selection } from "./element-actions";
import { NumberField } from "./number-field";
import { useStudio } from "./studio-context";

/**
 * The common number fields of the selection: X/Y (`u`, `v` in mm), rotation (°), scale (%) and
 * opacity (%). Each visit to a field is one undo step. A locked element keeps its place, size and
 * angle; a wrapped one cannot turn (R15) and says why.
 */
export function TransformFields({ target }: { target: Selection }) {
  const { editor } = useStudio();
  const wrapHintId = useId();
  const { element, surface } = target;
  const { placement, locked } = element;
  const wrapped = isWrapped(element, surface);
  const place = (patch: Partial<Placement>, session: string) =>
    patchElement(editor, target, { placement: { ...placement, ...patch } }, session);

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <NumberField
          label="X (mm)"
          value={placement.u}
          disabled={locked}
          onChange={(u, s) => place({ u }, s)}
        />
        <NumberField
          label="Y (mm)"
          value={placement.v}
          disabled={locked}
          onChange={(v, s) => place({ v }, s)}
        />
        <NumberField
          label="Góc xoay (°)"
          value={wrapped ? 0 : placement.rotationDeg}
          disabled={locked || wrapped}
          describedBy={wrapped ? wrapHintId : undefined}
          onChange={(deg, s) => place({ rotationDeg: normalizeDeg(deg) }, s)}
        />
        <NumberField
          label="Tỉ lệ (%)"
          value={placement.scale * 100}
          min={SCALE_RANGE.min * 100}
          max={SCALE_RANGE.max * 100}
          disabled={locked}
          onChange={(percent, s) => place({ scale: percent / 100 }, s)}
        />
        <NumberField
          label="Độ mờ đục (%)"
          value={element.opacity * 100}
          min={0}
          max={100}
          decimals={0}
          onChange={(percent, s) => patchElement(editor, target, { opacity: percent / 100 }, s)}
        />
      </div>
      {wrapped ? (
        <p id={wrapHintId} className="text-ink-tertiary text-xs">
          Phần tử uốn theo thân ly luôn nằm ngang nên không xoay được.
        </p>
      ) : null}
      {locked ? (
        <p className="text-ink-tertiary text-xs">
          Phần tử đang khoá: mở khoá trong tab Lớp để di chuyển, xoay hay xoá.
        </p>
      ) : null}
    </>
  );
}
