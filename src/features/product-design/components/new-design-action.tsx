"use client";

import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";

import { CopyLinkButton, useDeviceFit } from "./desktop-only-gate";

/** Said where a phone or tablet would otherwise find out only after choosing a product (SF-UX-8). */
export const DESIGN_NEEDS_COMPUTER = "Thiết kế chỉ làm được trên máy tính (cửa sổ từ 1024 px).";

const NOTE_ID = "new-design-needs-computer";

/**
 * "Thiết kế mới" on the design list. The studio opens on a computer only (decision 2026-10-26), so
 * on a phone or a tablet the button is locked and says so up front, with the page's link to copy,
 * instead of opening a product dialog whose "Bắt đầu" leads to the desktop-only notice. While the
 * device is unknown (the server render) the button is offered: a computer sees no flash of text.
 */
export function NewDesignAction({ onCreate }: { onCreate: () => void }) {
  const unsupported = useDeviceFit() === "unsupported";
  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <Button
        type="button"
        className="min-h-11 rounded-[var(--r-md)] px-5"
        disabled={unsupported}
        aria-describedby={unsupported ? NOTE_ID : undefined}
        onClick={onCreate}
      >
        <Plus aria-hidden className="size-4" />
        Thiết kế mới
      </Button>
      {unsupported ? (
        <>
          <p id={NOTE_ID} className="text-ink-secondary max-w-xs text-sm sm:text-right">
            {`${DESIGN_NEEDS_COMPUTER} Sao chép liên kết để mở trang này trên máy tính.`}
          </p>
          <CopyLinkButton />
        </>
      ) : null}
    </div>
  );
}
