"use client";

import { useState, type KeyboardEvent, type ReactNode } from "react";
import { Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface ChatComposerProps {
  placeholder?: string;
  /** Called with the trimmed text. Controlled callers clear the box themselves on success. */
  onSend: (message: string) => void;
  /** Controlled text; without it the composer keeps its own and clears it after sending. */
  value?: string;
  onValueChange?: (value: string) => void;
  maxLength?: number;
  disabled?: boolean;
  pending?: boolean;
  /** Sending is allowed with no text (e.g. a file is attached). */
  allowEmpty?: boolean;
  /** Left of the text box: e.g. an attach button. */
  leading?: ReactNode;
  /** Above the box: e.g. the chosen file. */
  header?: ReactNode;
}

export function ChatComposer({
  placeholder = "Nhập tin nhắn...",
  onSend,
  value,
  onValueChange,
  maxLength,
  disabled = false,
  pending = false,
  allowEmpty = false,
  leading,
  header,
}: ChatComposerProps) {
  const [own, setOwn] = useState("");
  const message = value ?? own;
  const setMessage = (next: string) => {
    if (value === undefined) setOwn(next);
    onValueChange?.(next);
  };
  const canSend = !disabled && !pending && (allowEmpty || message.trim() !== "");
  const submit = () => {
    if (!canSend) return;
    onSend(message.trim());
    if (value === undefined) setOwn("");
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends, Shift+Enter breaks the line; an IME composition is left alone.
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <div className="border-border-default bg-bg-surface focus-within:border-border-strong rounded-[1.5rem] border p-1 transition-colors">
      {header ? <div className="px-1 pt-1">{header}</div> : null}
      <div className="flex items-end gap-1">
        {leading}
        <Textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          aria-label="Nội dung tin nhắn"
          maxLength={maxLength}
          disabled={disabled}
          rows={1}
          // One line sits in the middle of the 44px row; more lines grow it up to 10 rem.
          className="max-h-40 min-h-11 resize-none border-0 bg-transparent px-2 py-2.5 text-sm leading-6 shadow-none focus-visible:ring-0 dark:bg-transparent"
        />
        <Button
          type="button"
          size="icon"
          className="size-11 shrink-0 rounded-full"
          onClick={submit}
          disabled={!canSend}
          aria-label={pending ? "Đang gửi" : "Gửi tin nhắn"}
        >
          <Send className="size-4" aria-hidden />
        </Button>
      </div>
    </div>
  );
}
