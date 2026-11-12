"use client";

import { AlignCenterHorizontal, AlignCenterVertical } from "lucide-react";
import { useId } from "react";

import { Button } from "@/components/ui/button";

import { isWrapped, type Placement } from "../../engine";
import {
  centredPlacement,
  normalizeDeg,
  patchElement,
  SCALE_RANGE,
  type Selection,
} from "./element-actions";
import { NumberField } from "./number-field";
import { useStudio } from "./studio-context";

const CENTRE_BUTTON = "min-h-11 justify-start rounded-[var(--r-md)] px-3";

/**
 * The body of the context bar's "Vị trí": the selection's X/Y (`u`, `v` in mm), rotation (°) and
 * scale (%), then centring it across or down the face. Each visit to a field is one undo step. A
 * locked element keeps its place, size and angle; a wrapped one cannot turn (R15) and says why.
 */
export function TransformFields({ target }: { target: Selection }) {
  const { editor } = useStudio();
  const wrapHintId = useId();
  const { element, surface } = target;
  const { placement, locked } = element;
  const wrapped = isWrapped(element, surface);
  const place = (patch: Partial<Placement>, session: string) =>
    patchElement(editor, target, { placement: { ...placement, ...patch } }, session);
  const centre = (axis: "u" | "v") =>
    patchElement(editor, target, { placement: centredPlacement(placement, surface, axis) });

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
      </div>
      {wrapped ? (
        <p id={wrapHintId} className="text-ink-tertiary text-xs">
          Phần tử uốn theo thân ly luôn nằm ngang nên không xoay được.
        </p>
      ) : null}
      {locked ? (
        <p className="text-ink-tertiary text-xs">
          Phần tử đang khoá: mở khoá trong Lớp để di chuyển, xoay hay xoá.
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant="outline"
          className={CENTRE_BUTTON}
          disabled={locked}
          onClick={() => centre("u")}
        >
          <AlignCenterVertical aria-hidden className="mr-1.5 size-4" />
          Căn giữa ngang
        </Button>
        <Button
          type="button"
          variant="outline"
          className={CENTRE_BUTTON}
          disabled={locked}
          onClick={() => centre("v")}
        >
          <AlignCenterHorizontal aria-hidden className="mr-1.5 size-4" />
          Căn giữa dọc
        </Button>
      </div>
    </>
  );
}
