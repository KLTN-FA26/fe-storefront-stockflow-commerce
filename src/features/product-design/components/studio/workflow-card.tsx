"use client";

import { MessageSquareWarning, PencilLine } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

import { allowedActions, DESIGN_UI_STATE_META, type DesignAction } from "../../lifecycle";
import { ChangeRequestDialog, type ChangeRequestKind } from "./change-request-dialog";
import { ConfirmedCard } from "./confirmed-card";
import { useWorkflow } from "./workflow-context";

/**
 * The workflow actions besides the header's primary one: for a design Sales sent, "Yêu cầu sửa"
 * and "Rút yêu cầu để chỉnh sửa" (each asks for a reason); for a confirmed design, the
 * `ConfirmedCard`. Nothing in the other states: their one action is the header's.
 */
export function WorkflowActions() {
  const { uiState } = useWorkflow();
  const actions = allowedActions(uiState);
  const [kind, setKind] = useState<ChangeRequestKind>("requestChanges");
  const [open, setOpen] = useState(false);
  const ask = (next: ChangeRequestKind) => {
    setKind(next);
    setOpen(true);
  };

  if (actions.includes("fork")) return <ConfirmedCard />;
  if (!actions.includes("requestChanges") && !actions.includes("withdraw")) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {actions.includes("requestChanges") ? (
        <Button
          type="button"
          variant="outline"
          className="min-h-11 rounded-[var(--r-md)] px-4"
          onClick={() => ask("requestChanges")}
        >
          <MessageSquareWarning aria-hidden className="mr-1.5 size-4" />
          Yêu cầu sửa
        </Button>
      ) : null}
      {actions.includes("withdraw") ? (
        <Button
          type="button"
          variant="outline"
          className="min-h-11 rounded-[var(--r-md)] px-4"
          onClick={() => ask("withdraw")}
        >
          <PencilLine aria-hidden className="mr-1.5 size-4" />
          Rút yêu cầu để chỉnh sửa
        </Button>
      ) : null}
      <ChangeRequestDialog kind={kind} open={open} onOpenChange={setOpen} />
    </div>
  );
}

/** The actions `WorkflowActions` shows; the others are the header's. */
const CARD_ACTIONS: readonly DesignAction[] = ["fork", "requestChanges", "withdraw"];

/**
 * The workflow card under the tool options: what happens next while the design is being edited
 * (`DESIGN_UI_STATE_META[uiState].hint`; once QC is involved the `StatusStrip` says it, and a
 * read-only design has it in the banner), with the workflow actions of its state. Nothing when
 * there is neither.
 */
export function WorkflowCard({ className }: { className?: string }) {
  const { uiState } = useWorkflow();
  const hint = uiState === "editing" ? DESIGN_UI_STATE_META[uiState].hint : null;
  const hasActions = allowedActions(uiState).some((action) => CARD_ACTIONS.includes(action));
  if (!hint && !hasActions) return null;
  return (
    <section
      aria-label="Bước tiếp theo"
      className={cn(
        "bg-bg-surface border-border-default flex shrink-0 flex-col gap-3 rounded-[var(--r-lg)] border p-[var(--card-pad)] shadow-[var(--sh-sm)]",
        className,
      )}
    >
      <h2 className="text-ink-primary text-sm font-semibold">Bước tiếp theo</h2>
      {hint ? <p className="text-ink-secondary text-sm">{hint}</p> : null}
      <WorkflowActions />
    </section>
  );
}
