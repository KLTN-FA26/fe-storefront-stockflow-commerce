"use client";

import { Layers, Redo2, RotateCcw, Undo2, ZoomIn, ZoomOut } from "lucide-react";

import { Button } from "@/components/ui/button";

interface CanvasToolbarProps {
  zoom: number;
  onUndo?: () => void;
  onRedo?: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onReset?: () => void;
  onToggleLayers?: () => void;
}

export function CanvasToolbar({ zoom, onUndo, onRedo, onZoomIn, onZoomOut, onReset, onToggleLayers }: CanvasToolbarProps) {
  const actions = [
    [Undo2, "Hoàn tác", onUndo],
    [Redo2, "Làm lại", onRedo],
    [ZoomOut, "Thu nhỏ", onZoomOut],
    [ZoomIn, "Phóng to", onZoomIn],
    [RotateCcw, "Reset", onReset],
    [Layers, "Lớp", onToggleLayers],
  ] as const;

  return (
    <div className="flex max-w-full items-center gap-1 overflow-x-auto rounded-[var(--r-lg)] border border-border-default bg-bg-surface p-1 shadow-[var(--card-shadow)] [scrollbar-width:none]">
      {actions.map(([Icon, label, action]) => (
        <Button key={label} type="button" size="icon" variant="ghost" className="size-11 shrink-0 rounded-full" disabled={!action} onClick={action} aria-label={label}>
          <Icon className="h-4 w-4" />
        </Button>
      ))}
      <span className="shrink-0 px-2 text-sm font-semibold tabular-nums text-ink-secondary">{zoom}%</span>
    </div>
  );
}
