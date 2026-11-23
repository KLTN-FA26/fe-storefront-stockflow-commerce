"use client";

import { FileSignature, Paperclip, X } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * The ask the order page's "Gửi bản đã ký" carries to the thread (`?attach=pdf`): send the signed
 * contract here. A browser opens a file picker only on a user's click, so the page never opens it by
 * itself: "Chọn file" is that click. Dismissible; the composer drops it once a file is sent.
 */
export function SignedCopyPrompt({
  onChoose,
  onDismiss,
  disabled = false,
}: {
  onChoose: () => void;
  onDismiss: () => void;
  disabled?: boolean;
}) {
  return (
    <section
      aria-labelledby="signed-copy-prompt-text"
      className="border-info/30 bg-info/5 flex items-center gap-2 rounded-[var(--r-md)] border py-1 pr-1 pl-3"
    >
      <FileSignature aria-hidden className="text-info-ink size-5 shrink-0" />
      <p id="signed-copy-prompt-text" className="text-ink-primary min-w-0 flex-1 text-sm">
        Gửi bản hợp đồng đã ký: chọn file PDF hoặc ảnh
      </p>
      <Button
        type="button"
        variant="outline"
        className="min-h-11 shrink-0 rounded-[var(--r-md)] px-3"
        disabled={disabled}
        onClick={onChoose}
      >
        <Paperclip aria-hidden className="size-4" />
        Chọn file
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="text-ink-secondary size-11 shrink-0 rounded-full"
        aria-label="Ẩn lời nhắc gửi hợp đồng đã ký"
        onClick={onDismiss}
      >
        <X aria-hidden className="size-4" />
      </Button>
    </section>
  );
}
