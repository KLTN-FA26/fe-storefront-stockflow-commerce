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
    <div className="flex flex-wrap items-center gap-2 rounded-full border border-border-default bg-bg-surface p-2 shadow-md">
      {actions.map(([Icon, label, action]) => (
        <Button key={label} type="button" size="icon" variant="ghost" className="h-9 w-9 rounded-full" disabled={!action} onClick={action} aria-label={label}>
          <Icon className="h-4 w-4" />
        </Button>
      ))}
      <span className="px-2 text-sm font-semibold tabular-nums text-ink-secondary">{zoom}%</span>
    </div>
  );
}
