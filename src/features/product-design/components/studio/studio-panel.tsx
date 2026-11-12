"use client";

import { X } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

import { DecisionHistory } from "./decision-history";
import { LayersPanel } from "./layers-panel";
import { PreflightPanel } from "./preflight-panel";
import { useEditorState, useStudio } from "./studio-context";
import { useEscapeClose, usePanelOpener, useRailRef, useStudioPanel } from "./studio-panel-context";
import { STUDIO_TOOLS } from "./studio-tools";
import { ToolOptions } from "./tool-options";

export { StudioPanelProvider } from "./studio-panel-context";

const PANEL_TITLES = {
  layers: "Lớp",
  check: "Kiểm tra trước khi in",
  history: "Lịch sử",
} as const;

/**
 * The panel of the rail (288 px): the open item's content under a title and "Đóng bảng". From
 * `xl` it sits beside the stage; below it, over the stage's left edge. `Esc` closes it and puts
 * focus back on what opened it (the rail item, or the header's check chip); `onEditText` opens a
 * text of the Lớp list for typing. A read-only design has no tools: "tool" never shows then (a
 * design submitted with its options open closes them), the three lists do.
 */
export function StudioPanel({ onEditText }: { onEditText?: (id: string) => void }) {
  const { design, readOnly } = useStudio();
  const { active: open, close } = useStudioPanel();
  const railRef = useRailRef();
  const openerRef = usePanelOpener();
  const tool = useEditorState((s) => s.tool);
  const escape = useEscapeClose();
  const hidden = readOnly && open === "tool";
  const active = hidden ? null : open;
  useEffect(() => {
    if (hidden) close();
  }, [hidden, close]);
  if (active === null) return null;

  const title =
    active === "tool"
      ? (STUDIO_TOOLS.find(({ id }) => id === tool)?.short ?? "Công cụ")
      : PANEL_TITLES[active];
  // What opened it: the check chip, or else its rail item; the first item when that is gone (a
  // tool item of a design that turned read-only).
  const returnFocus = () => {
    const chip = openerRef.current;
    if (chip?.isConnected) {
      chip.focus();
      return;
    }
    const rail = railRef.current;
    const opener = rail?.querySelector<HTMLElement>(
      `[data-rail="${active === "tool" ? tool : active}"]`,
    );
    (opener ?? rail?.querySelector<HTMLElement>("[data-rail]"))?.focus();
  };

  return (
    <section
      aria-label={active === "tool" ? "Tùy chọn công cụ" : title}
      onKeyDown={(event) => {
        if (escape(event)) returnFocus();
      }}
      className={cn(
        "bg-bg-surface border-border-default flex min-h-0 w-72 shrink-0 flex-col overflow-hidden rounded-[var(--r-lg)] border shadow-[var(--sh-sm)]",
        // Below `xl` it floats over the stage instead of narrowing it. The offsets come from the
        // row's spacing: left-24 (96 px) = p-3 + the rail's w-18 + gap-3, the stage's left edge;
        // top-3 = the row's p-3, or top-15 (60 px) = p-3 + the 44 px face strip when read-only, so
        // the faces stay reachable; bottom-17 (68 px) = p-3 + the stage's 56 px zoom bar (a 44 px
        // button, py-1 and its rule), so zooming stays reachable. z-20 is above the 3D card's z-10.
        "max-xl:absolute max-xl:bottom-17 max-xl:left-24 max-xl:z-20 max-xl:shadow-[var(--sh-md)]",
        readOnly ? "max-xl:top-15" : "max-xl:top-3",
      )}
    >
      <header className="border-border-default flex h-12 shrink-0 items-center justify-between border-b pr-1 pl-[var(--card-pad)]">
        <h2 className="text-ink-primary text-sm font-semibold">{title}</h2>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Đóng bảng"
          title="Đóng bảng (Esc)"
          className="size-11 rounded-[var(--r-md)]"
          onClick={() => {
            close();
            returnFocus();
          }}
        >
          <X aria-hidden />
        </Button>
      </header>
      {/* Focusable, so the keyboard can scroll it whatever it holds (a list of rows, text). */}
      <div
        tabIndex={0}
        data-slot="panel-body"
        className={cn(
          "focus-visible:ring-accent min-h-0 flex-1 overflow-y-auto outline-none focus-visible:ring-2 focus-visible:ring-inset",
          active === "layers" ? "p-2" : "p-[var(--card-pad)]",
        )}
      >
        {active === "tool" ? <ToolOptions /> : null}
        {active === "layers" ? <LayersPanel {...(onEditText ? { onEditText } : {})} /> : null}
        {active === "check" ? <PreflightPanel heading={false} /> : null}
        {active === "history" ? <DecisionHistory designId={design.id} /> : null}
      </div>
    </section>
  );
}
