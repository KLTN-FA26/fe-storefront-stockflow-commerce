"use client";

import { CopyToFace } from "./copy-to-face";
import { useEditorState } from "./studio-context";

/**
 * The context bar with nothing selected: a one-line hint, and "Sao chép sang mặt khác" for the
 * active face where the template has another one.
 */
export function BarHint() {
  const readOnly = useEditorState((s) => s.readOnly);
  return (
    <>
      <p className="text-ink-tertiary min-w-0 truncate text-sm">
        Chọn một phần tử trên khung vẽ hoặc trong Lớp để chỉnh thuộc tính.
      </p>
      <fieldset disabled={readOnly} className="m-0 shrink-0 border-0 p-0">
        <CopyToFace compact />
      </fieldset>
    </>
  );
}
