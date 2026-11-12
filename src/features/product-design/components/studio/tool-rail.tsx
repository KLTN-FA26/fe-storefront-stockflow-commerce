"use client";

import { History, Layers, ShieldCheck, type LucideIcon } from "lucide-react";
import type { ComponentProps } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

import type { ToolId } from "../../engine";
import { useEditorState, useStudio } from "./studio-context";
import {
  useEscapeClose,
  useRailRef,
  useStudioPanel,
  type StudioPanelId,
} from "./studio-panel-context";
import { STUDIO_TOOLS } from "./studio-tools";
import { useHasReviewHistory } from "./use-review-history";

/** The rail's items that only open a panel, after the tools. */
const PANEL_ITEMS: readonly {
  id: Exclude<StudioPanelId, "tool">;
  label: string;
  icon: LucideIcon;
}[] = [
  { id: "layers", label: "Lớp", icon: Layers },
  { id: "check", label: "Kiểm tra", icon: ShieldCheck },
  { id: "history", label: "Lịch sử", icon: History },
];

/** One rail item: the icon over a short label, 72 px wide, `label` (with the shortcut) its name. */
function RailItem({
  id,
  label,
  text,
  icon: Icon,
  pressed,
  onClick,
}: {
  id: string;
  label: string;
  text: string;
  icon: LucideIcon;
  pressed: boolean;
  onClick: ComponentProps<typeof Button>["onClick"];
}) {
  // A native `title`, not a Radix tooltip: a tooltip that opens on focus takes the first Esc.
  return (
    <Button
      type="button"
      variant="ghost"
      data-rail={id}
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      onClick={onClick}
      className={cn(
        "text-ink-secondary h-14 min-h-11 w-full shrink-0 flex-col gap-0.5 rounded-[var(--r-md)] px-1 text-xs font-medium",
        "aria-pressed:bg-bg-muted aria-pressed:text-accent",
      )}
    >
      <Icon aria-hidden className="size-5" />
      <span aria-hidden>{text}</span>
    </Button>
  );
}

/**
 * The labelled rail, left of the panel: the six tools, then Lớp, Kiểm tra and, when the design has
 * a review history, Lịch sử. A tool item sets the tool and opens its options (the active tool
 * again, with its options open, closes them); Chọn closes the tool options only. The other three
 * open their panel and leave the tool alone, and again close it. A tool key never opens or closes
 * the panel (`useStudioShortcuts`); an open "tool" panel follows the tool. Read-only, there are
 * only the three lists, which show their content view-only.
 */
export function ToolRail() {
  const { editor, design, readOnly } = useStudio();
  const tool = useEditorState((s) => s.tool);
  const { active, open, toggle, close } = useStudioPanel();
  const railRef = useRailRef();
  const hasHistory = useHasReviewHistory(design.id);
  const escape = useEscapeClose();

  const pickTool = (id: ToolId) => {
    editor.setTool(id);
    // Chọn closes the tool options only: a list (Lớp, Kiểm tra, Lịch sử) stays open.
    if (id === "select" || id === tool) {
      if (active === "tool") close();
      else if (id !== "select") open("tool");
    } else open("tool");
  };

  return (
    <div
      role="group"
      ref={railRef}
      onKeyDown={(event) => void escape(event)}
      aria-label={readOnly ? "Bảng" : "Công cụ"}
      className="bg-bg-surface border-border-default flex w-18 shrink-0 flex-col items-center gap-1 self-stretch overflow-y-auto rounded-[var(--r-lg)] border p-1.5 shadow-[var(--sh-sm)]"
    >
      {readOnly
        ? null
        : STUDIO_TOOLS.map(({ id, label, short, icon }) => (
            <RailItem
              key={id}
              id={id}
              label={label}
              text={short}
              icon={icon}
              pressed={tool === id}
              onClick={() => pickTool(id)}
            />
          ))}
      {readOnly ? null : <span aria-hidden className="bg-border-default my-1 h-px w-10 shrink-0" />}
      {PANEL_ITEMS.filter(({ id }) => id !== "history" || hasHistory).map(({ id, label, icon }) => (
        <RailItem
          key={id}
          id={id}
          label={label}
          text={label}
          icon={icon}
          pressed={active === id}
          onClick={() => toggle(id)}
        />
      ))}
    </div>
  );
}
