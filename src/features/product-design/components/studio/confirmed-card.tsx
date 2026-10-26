"use client";

import { Copy, CopyPlus, MessagesSquare } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef } from "react";

import { STORE_ROUTES } from "@/constants";
import { Alert } from "@/components/shared";
import { Button } from "@/components/ui/button";

import { describeDesignError } from "../../errors";
import { useForkDesign } from "../../mutations";
import { useDesignSnapshot } from "../../queries";
import { STUDIO_ANNOUNCEMENTS } from "./studio-announcer";
import { useWorkflow } from "./workflow-context";

/** Selects the text of `element`, so the customer can copy it by hand. */
function selectText(element: HTMLElement | null) {
  const selection = window.getSelection();
  if (!element || !selection) return;
  selection.selectAllChildren(element);
}

/**
 * The confirmed design (spec §7.5): the snapshot's id with "Sao chép mã" (to quote to Sales),
 * "Yêu cầu báo giá" (the chat with Sales) and "Tạo phiên bản mới" (a new draft from the snapshot).
 */
export function ConfirmedCard() {
  const { design, announce } = useWorkflow();
  const { push } = useRouter();
  const snapshot = useDesignSnapshot(design.id, true);
  const fork = useForkDesign();
  const codeRef = useRef<HTMLElement>(null);
  const snapshotId = snapshot.data?.id;

  const copy = async () => {
    if (!snapshotId) return;
    try {
      await navigator.clipboard.writeText(snapshotId);
      announce(STUDIO_ANNOUNCEMENTS.snapshotCopied);
    } catch {
      // No clipboard (an insecure origin, a refused permission): the code is selected instead.
      selectText(codeRef.current);
      announce(STUDIO_ANNOUNCEMENTS.snapshotSelected);
    }
  };

  const error = snapshot.error ?? fork.error;
  return (
    <section aria-label="Bản chốt" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <p className="text-ink-tertiary text-xs font-medium">Mã bản chốt</p>
        <div className="flex flex-wrap items-center gap-2">
          <code
            ref={codeRef}
            className="text-ink-primary min-w-0 font-mono text-sm break-all tabular-nums"
          >
            {snapshotId ?? "Đang tải…"}
          </code>
          <Button
            type="button"
            variant="outline"
            className="min-h-11 rounded-[var(--r-md)] px-3"
            disabled={!snapshotId}
            onClick={() => void copy()}
          >
            <Copy aria-hidden className="mr-1.5 size-4" />
            Sao chép mã
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button asChild className="min-h-11 rounded-[var(--r-md)] px-4">
          <Link href={STORE_ROUTES.chat.list}>
            <MessagesSquare aria-hidden className="mr-1.5 size-4" />
            Yêu cầu báo giá
          </Link>
        </Button>
        <Button
          type="button"
          variant="outline"
          className="min-h-11 rounded-[var(--r-md)] px-4"
          disabled={fork.isPending}
          onClick={() =>
            fork.mutate(design.id, {
              onSuccess: (draft) => push(STORE_ROUTES.design.detail(draft.id)),
            })
          }
        >
          <CopyPlus aria-hidden className="mr-1.5 size-4" />
          Tạo phiên bản mới
        </Button>
      </div>
      {error ? <Alert tone="danger">{describeDesignError(error)}</Alert> : null}
    </section>
  );
}
