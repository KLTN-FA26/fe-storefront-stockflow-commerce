"use client";

import { useLayoutEffect, useRef, type FocusEvent, type RefObject } from "react";

import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/cn";

import { BAR_SECTIONS, ContextBar } from "./context-bar";
import { ConflictDialog } from "./conflict-dialog";
import { PreflightProvider } from "./preflight-context";
import { PrimaryAction } from "./primary-action";
import { StageArea } from "./stage-area";
import { StatusBanner } from "./status-banner";
import { StudioAnnouncer } from "./studio-announcer";
import { StudioProvider } from "./studio-context";
import { StudioHeader } from "./studio-header";
import { StudioPanel, StudioPanelProvider } from "./studio-panel";
import { StudioBodySkeleton } from "./studio-skeleton";
import { SurfaceSwitcher } from "./surface-switcher";
import { TextEditingProvider } from "./text-editing";
import { LibraryPlacementProvider } from "./use-library-placement";
import { ToolRail } from "./tool-rail";
import { UnsavedDraftDialog } from "./unsaved-draft-dialog";
import { useStudioServices, type StudioWorkspaceProps } from "./use-studio-services";

export type { StudioWorkspaceProps } from "./use-studio-services";

/**
 * Focus on a control that goes when the design turns read-only (the bar, a tool item, the tool
 * options, the card's buttons) moves to the stage's view instead of falling to the page. Answers
 * the work area's `onFocus`, which notes where focus was.
 */
function useFocusRescue(readOnly: boolean, stageRef: RefObject<HTMLElement | null>) {
  const last = useRef<Element | null>(null);
  useLayoutEffect(() => {
    const lost = last.current;
    const active = document.activeElement;
    if (!lost || lost.isConnected || (active && active !== document.body && active.isConnected)) {
      return;
    }
    stageRef.current?.querySelector<HTMLElement>("[role='group']")?.focus({ preventScroll: true });
  }, [readOnly, stageRef]);
  return (event: FocusEvent) => {
    last.current = event.target;
  };
}

/**
 * The loaded studio: its services (`useStudioServices`) laid out as header, context bar and, under
 * them, the rail, its panel and the stage area (layout A). It follows the design's status (spec
 * §6.4): a DRAFT is edited; otherwise the bar and the tools are gone and nothing is saved, while
 * the lists, the stage and the 3D view still show it. Both states are one tree, so the rail, the
 * panel, the stage and the 3D view stay mounted when the status changes.
 */
export function StudioWorkspace(props: StudioWorkspaceProps) {
  const { design, productPhoto } = props;
  const { services, autosave, announcement, textEditing, fontsReady } = useStudioServices(props);
  const { readOnly } = services;
  const noteFocus = useFocusRescue(readOnly, services.stageRef);

  return (
    <StudioProvider value={services}>
      <PreflightProvider>
        <TextEditingProvider value={textEditing}>
          <LibraryPlacementProvider>
            <TooltipProvider>
              <StudioPanelProvider>
                <div className="flex h-dvh flex-col">
                  <StudioHeader autosave={autosave} action={<PrimaryAction />} />
                  <StatusBanner design={design} />
                  {!fontsReady ? (
                    <StudioBodySkeleton />
                  ) : (
                    // Desktop only (≥ 1024 px, `DesktopOnlyGate`). Read-only: no bar; the rail keeps
                    // Lớp, Kiểm tra and Lịch sử (view only), and the stage area splits its width.
                    <main className="flex min-h-0 flex-1 flex-col" onFocus={noteFocus}>
                      {readOnly ? null : (
                        <ContextBar sections={BAR_SECTIONS} end={<SurfaceSwitcher />} />
                      )}
                      <div
                        className={cn(
                          "relative flex min-h-0 flex-1 gap-3 p-3",
                          readOnly && "overflow-hidden",
                        )}
                      >
                        <ToolRail />
                        <StudioPanel {...(readOnly ? {} : { onEditText: textEditing.start })} />
                        <StageArea productPhoto={productPhoto} readOnly={readOnly} />
                      </div>
                    </main>
                  )}
                  <StudioAnnouncer announcement={announcement} />
                  <ConflictDialog open={autosave.state === "conflict"} />
                  <UnsavedDraftDialog record={props.record} />
                </div>
              </StudioPanelProvider>
            </TooltipProvider>
          </LibraryPlacementProvider>
        </TextEditingProvider>
      </PreflightProvider>
    </StudioProvider>
  );
}
