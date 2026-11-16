"use client";

import { Download } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type MouseEvent, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { downloadDocumentJson } from "./download-json";
import { useStudio } from "./studio-context";

/**
 * The question every in-app way out of the studio asks while an edit is not stored (`unsaved`): a
 * link inside the app fires no `beforeunload`. `guard(href)` is the link's `onClick`; `dialog` is
 * rendered once next to it. "Rời đi" leaves (the browser keeps the draft to offer back next time),
 * "Ở lại" stays, and the JSON copy is one click away.
 */
export function useLeaveGuard(unsaved: boolean): {
  guard: (href: string) => (event: MouseEvent) => void;
  dialog: ReactNode;
} {
  const { editor, design } = useStudio();
  const { push } = useRouter();
  const [asking, setAsking] = useState<string | null>(null);

  const guard = (href: string) => (event: MouseEvent) => {
    if (!unsaved) return;
    event.preventDefault();
    setAsking(href);
  };

  const dialog = (
    <Dialog open={asking !== null} onOpenChange={(open) => (open ? undefined : setAsking(null))}>
      <DialogContent className="bg-bg-surface text-ink-primary rounded-[var(--r-xl)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Thay đổi chưa được lưu</DialogTitle>
          <DialogDescription>
            Thay đổi chưa được lưu lên hệ thống. Nếu rời đi, trình duyệt này vẫn giữ bản nháp để bạn
            khôi phục lần sau; muốn chắc chắn, hãy tải bản sao JSON trước.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="border-border-default bg-bg-subtle">
          <Button
            type="button"
            variant="ghost"
            className="min-h-11 rounded-[var(--r-md)] px-4"
            onClick={() => downloadDocumentJson(editor.store.getState().document, design.id)}
          >
            <Download aria-hidden className="mr-1.5 size-4" />
            Tải bản sao JSON
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-11 rounded-[var(--r-md)] px-4"
            onClick={() => {
              const href = asking;
              setAsking(null);
              if (href !== null) push(href);
            }}
          >
            Rời đi
          </Button>
          <Button
            type="button"
            className="min-h-11 rounded-[var(--r-md)] px-4"
            onClick={() => setAsking(null)}
          >
            Ở lại
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
  return { guard, dialog };
}
