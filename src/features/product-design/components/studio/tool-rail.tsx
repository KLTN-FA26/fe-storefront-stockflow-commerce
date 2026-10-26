"use client";

import {
  Brush,
  Eraser,
  ImagePlus,
  MousePointer2,
  PaintBucket,
  Type,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/cn";

import type { ToolId } from "../../engine";
import { useEditorState, useStudio } from "./studio-context";
import { StudioIconButton } from "./studio-icon-button";

/** The studio's tools with their shortcut keys (spec §6.2), in rail order. */
export const STUDIO_TOOLS: readonly { id: ToolId; label: string; icon: LucideIcon }[] = [
  { id: "select", label: "Chọn (V)", icon: MousePointer2 },
  { id: "image", label: "Ảnh/Logo (U)", icon: ImagePlus },
  { id: "text", label: "Chữ (T)", icon: Type },
  { id: "brush", label: "Vẽ (B)", icon: Brush },
  { id: "eraser", label: "Tẩy (E)", icon: Eraser },
  { id: "background", label: "Nền (G)", icon: PaintBucket },
];

/**
 * The tool rail: one button per tool, the active one pressed. While the design is read-only only
 * "Chọn (V)" stays available.
 */
export function ToolRail({ className }: { className?: string }) {
  const { editor } = useStudio();
  const active = useEditorState((s) => s.tool);
  const readOnly = useEditorState((s) => s.readOnly);

  return (
    <div
      role="group"
      aria-label="Công cụ"
      className={cn(
        "bg-bg-surface border-border-default flex flex-col items-center gap-1 rounded-[var(--r-lg)] border p-1.5 shadow-[var(--sh-sm)]",
        className,
      )}
    >
      {STUDIO_TOOLS.map(({ id, label, icon: Icon }) => (
        <StudioIconButton
          key={id}
          label={label}
          aria-pressed={active === id}
          disabled={readOnly && id !== "select"}
          onClick={() => editor.setTool(id)}
          className="aria-pressed:bg-bg-muted aria-pressed:text-accent"
        >
          <Icon aria-hidden />
        </StudioIconButton>
      ))}
    </div>
  );
}
