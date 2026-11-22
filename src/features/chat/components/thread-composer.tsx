"use client";

import { useRef, useState } from "react";
import { FileText, Paperclip, X } from "lucide-react";

import { describeBeRefusal, hasErrorCode } from "@/lib/api/describe-error";
import { formatFileSize } from "@/lib/format/number";

import { ChatComposer } from "@/components/storefront/chat-composer";
import { Button } from "@/components/ui/button";

import { CHAT_MESSAGE_BY_CODE } from "../labels";
import { useSendAttachment, useSendText } from "../mutations";
import { CHAT_FILE_ACCEPT, CHAT_TEXT_MAX, chatFileProblem, chatTextSchema } from "../schemas";
import { newClientMessageId } from "../selectors";
import { SignedCopyPrompt } from "./signed-copy-prompt";

interface ThreadComposerProps {
  conversationId: string;
  /** The BE said the conversation ended (409 CHAT_CONVERSATION_ENDED): offer to reopen it. */
  onEnded: () => void;
  /**
   * The page that sent the customer here asked for the signed contract (`?attach=pdf`): a prompt above the box whose
   * button opens the file picker. `onSignedCopyDone` runs when it is dismissed or a file was sent.
   */
  askSignedCopy?: boolean;
  onSignedCopyDone?: () => void;
}

/**
 * Text or one file (JPEG/PNG/WebP/PDF ≤ 20 MB, e.g. the signed contract scan) with an optional
 * caption. A failed send keeps its text and its `clientMessageId`, so the retry is the same message
 * to the BE (C5/C6); changing the text gives it a new id.
 */
export function ThreadComposer({
  conversationId,
  onEnded,
  askSignedCopy = false,
  onSignedCopyDone,
}: ThreadComposerProps) {
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [clientMessageId, setClientMessageId] = useState(newClientMessageId);
  const attempted = useRef<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const sendText = useSendText(conversationId);
  const sendFile = useSendAttachment(conversationId);
  const pending = sendText.isPending || sendFile.isPending;

  const freshId = () => {
    attempted.current = null;
    setClientMessageId(newClientMessageId());
  };
  const handlers = {
    onSuccess: () => {
      setText("");
      setFile(null);
      setProblem(null);
      freshId();
    },
    onError: (failure: unknown) => {
      if (hasErrorCode(failure, "CHAT_CONVERSATION_ENDED")) onEnded();
      setProblem(describeBeRefusal(failure, CHAT_MESSAGE_BY_CODE));
    },
  };

  const send = (trimmed: string) => {
    setProblem(null);
    attempted.current = `${file?.name ?? ""}|${trimmed}`;
    if (file) {
      sendFile.mutate(
        { file, caption: trimmed || undefined, clientMessageId },
        {
          ...handlers,
          onSuccess: () => {
            handlers.onSuccess();
            onSignedCopyDone?.();
          },
        },
      );
      return;
    }
    const parsed = chatTextSchema.safeParse(trimmed);
    if (!parsed.success) {
      setProblem(parsed.error.issues[0]?.message ?? "Tin nhắn không hợp lệ.");
      return;
    }
    sendText.mutate({ text: parsed.data, clientMessageId }, handlers);
  };

  const changeText = (next: string) => {
    setText(next);
    if (attempted.current !== null && attempted.current !== `${file?.name ?? ""}|${next.trim()}`) {
      freshId();
    }
  };

  const choose = (chosen: File | undefined) => {
    if (!chosen) return;
    const why = chatFileProblem(chosen);
    setProblem(why);
    if (!why) {
      setFile(chosen);
      freshId();
    }
  };

  return (
    <div className="space-y-2">
      {problem ? (
        <p role="alert" className="text-danger text-sm">
          {problem}
        </p>
      ) : null}
      {askSignedCopy ? (
        <SignedCopyPrompt
          disabled={pending}
          onChoose={() => picker.current?.click()}
          onDismiss={() => onSignedCopyDone?.()}
        />
      ) : null}
      <input
        ref={picker}
        type="file"
        accept={CHAT_FILE_ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-label="Chọn ảnh hoặc file PDF"
        onChange={(event) => {
          choose(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      <ChatComposer
        value={text}
        onValueChange={changeText}
        onSend={send}
        maxLength={CHAT_TEXT_MAX}
        pending={pending}
        allowEmpty={file !== null}
        placeholder={file ? "Thêm chú thích (không bắt buộc)..." : "Nhập tin nhắn..."}
        leading={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-ink-secondary size-11 shrink-0 rounded-full"
            aria-label="Đính kèm ảnh hoặc PDF"
            disabled={pending}
            onClick={() => picker.current?.click()}
          >
            <Paperclip aria-hidden className="size-5" />
          </Button>
        }
        header={
          file ? (
            <div className="bg-bg-subtle mb-2 flex items-center gap-2 rounded-[var(--r-md)] pl-2.5">
              <FileText aria-hidden className="text-ink-secondary size-4 shrink-0" />
              <span className="text-ink-primary min-w-0 flex-1 truncate text-sm">{file.name}</span>
              <span className="text-ink-tertiary shrink-0 text-xs tabular-nums">
                {formatFileSize(file.size)}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-11 shrink-0 rounded-full"
                aria-label={`Bỏ file ${file.name}`}
                onClick={() => {
                  setFile(null);
                  freshId();
                }}
              >
                <X aria-hidden className="size-4" />
              </Button>
            </div>
          ) : null
        }
      />
    </div>
  );
}
