"use client";

import { ArrowLeft, Download } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { STORE_ROUTES } from "@/constants";
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
 * The header's way back to the design list. While an edit is not stored yet (`unsaved`) it asks
 * first: a link inside the app fires no `beforeunload`. "Rời đi" leaves (the browser keeps the
 * draft to offer back next time), "Ở lại" stays, and the JSON copy is one click away.
 */
export function StudioBackLink({ unsaved }: { unsaved: boolean }) {
  const { editor, design } = useStudio();
  const { push } = useRouter();
  const [asking, setAsking] = useState(false);

  return (
    <>
      <Button
        asChild
        variant="ghost"
        className="min-h-11 min-w-11 shrink-0 rounded-[var(--r-md)] px-3"
      >
        <Link
          href={STORE_ROUTES.design.list}
          onClick={(event) => {
            if (!unsaved) return;
            event.preventDefault();
            setAsking(true);
          }}
        >
          <ArrowLeft aria-hidden className="size-4" />
          <span className="sr-only sm:not-sr-only sm:ml-1.5">Thiết kế của tôi</span>
        </Link>
      </Button>
      <Dialog open={asking} onOpenChange={setAsking}>
        <DialogContent className="bg-bg-surface text-ink-primary rounded-[var(--r-xl)] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Thay đổi chưa được lưu</DialogTitle>
            <DialogDescription>
              Thay đổi chưa được lưu lên hệ thống. Nếu rời đi, trình duyệt này vẫn giữ bản nháp để
              bạn khôi phục lần sau; muốn chắc chắn, hãy tải bản sao JSON trước.
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
                setAsking(false);
                push(STORE_ROUTES.design.list);
              }}
            >
              Rời đi
            </Button>
            <Button
              type="button"
              className="min-h-11 rounded-[var(--r-md)] px-4"
              onClick={() => setAsking(false)}
            >
              Ở lại
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
