"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

import type { ToolId } from "../../engine";
import { BackgroundToolPanel } from "./background-tool-panel";
import { BrushToolPanel } from "./brush-tool-panel";
import { ImageToolPanel } from "./image-tool-panel";
import { useEditorState } from "./studio-context";
import { TextToolPanel } from "./text-tool-panel";

function options(tool: ToolId): ReactNode {
  switch (tool) {
    case "select":
      return (
        <p className="text-ink-tertiary text-sm">
          Chọn một phần tử trên khung vẽ để di chuyển, xoay hoặc đổi kích thước.
        </p>
      );
    case "image":
      return <ImageToolPanel />;
    case "text":
      return <TextToolPanel />;
    case "brush":
      return <BrushToolPanel mode="brush" />;
    case "eraser":
      return <BrushToolPanel mode="eraser" />;
    case "background":
      return <BackgroundToolPanel />;
  }
}

/** The options of the active tool, beside the tool rail; they scroll when the column is short. */
export function ToolPanel({ className }: { className?: string }) {
  const tool = useEditorState((s) => s.tool);
  return (
    <section
      aria-label="Tùy chọn công cụ"
      className={cn(
        "bg-bg-surface border-border-default flex min-h-0 flex-col overflow-y-auto rounded-[var(--r-lg)] border p-[var(--card-pad)] shadow-[var(--sh-sm)]",
        className,
      )}
    >
      {options(tool)}
    </section>
  );
}
