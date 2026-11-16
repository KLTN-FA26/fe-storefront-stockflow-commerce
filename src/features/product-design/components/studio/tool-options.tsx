"use client";

import type { ReactNode } from "react";

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

/**
 * The options of the active tool, the content of the panel's "tool" item; they follow the tool
 * when a shortcut changes it while the panel is open.
 */
export function ToolOptions() {
  return options(useEditorState((s) => s.tool));
}
