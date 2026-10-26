"use client";

import { Expand, Focus, Rotate3d } from "lucide-react";
import type { ReactNode } from "react";

import { Toggle } from "@/components/ui/toggle";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

import { StudioIconButton } from "./studio-icon-button";

/** The preview panel's title bar; `children` is its toolbar. */
export function ViewerTitle({ children }: { children?: ReactNode }) {
  return (
    <div className="border-border-default flex min-h-12 items-center justify-between gap-2 border-b px-2">
      <h2 className="text-ink-primary px-2 text-sm font-semibold">Xem trước 3D</h2>
      {children}
    </div>
  );
}

/** The 3D view's controls: auto-rotate (a toggle), back to the home view, full screen. */
export function ViewerToolbar({
  autoRotate,
  onAutoRotate,
  onResetView,
  fullscreen,
  onFullscreen,
}: {
  autoRotate: boolean;
  onAutoRotate: (on: boolean) => void;
  onResetView: () => void;
  fullscreen: boolean;
  onFullscreen: () => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <Tooltip>
        <TooltipTrigger asChild>
          <Toggle
            aria-label="Tự xoay"
            pressed={autoRotate}
            onPressedChange={onAutoRotate}
            className="size-11 rounded-[var(--r-md)]"
          >
            <Rotate3d aria-hidden />
          </Toggle>
        </TooltipTrigger>
        <TooltipContent>Tự xoay</TooltipContent>
      </Tooltip>
      <StudioIconButton label="Đặt lại góc nhìn" onClick={onResetView}>
        <Focus aria-hidden />
      </StudioIconButton>
      <StudioIconButton label="Toàn màn hình" aria-pressed={fullscreen} onClick={onFullscreen}>
        <Expand aria-hidden />
      </StudioIconButton>
    </div>
  );
}
