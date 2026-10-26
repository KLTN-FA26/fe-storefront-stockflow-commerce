"use client";

import { Lock } from "lucide-react";

import { DESIGN_UI_STATE_META, type DesignUiState } from "../../lifecycle";

/**
 * Why the design cannot be edited (spec §6.3) and what happens next. The way forward ("Yêu cầu
 * sửa", "Rút yêu cầu để chỉnh sửa"; for a confirmed design its snapshot id, "Yêu cầu báo giá" and
 * "Tạo phiên bản mới") is in the side column's workflow card, the state's badge in the header.
 */
export function ReadOnlyBanner({ state }: { state: DesignUiState }) {
  return (
    <div className="bg-bg-surface border-border-default border-b px-[var(--card-pad)] py-2">
      <p className="text-ink-secondary flex min-w-0 items-start gap-2 text-sm">
        <Lock aria-hidden className="mt-0.5 size-4 shrink-0" />
        <span>
          <strong className="text-ink-primary">Chỉ xem.</strong> {DESIGN_UI_STATE_META[state].hint}
        </span>
      </p>
    </div>
  );
}
