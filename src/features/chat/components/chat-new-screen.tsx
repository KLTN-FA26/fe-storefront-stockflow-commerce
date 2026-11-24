"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { ChevronLeft, MessagesSquare, SendHorizontal } from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { CHAT_WITH_SALES, STORE_ROUTES } from "@/constants";
import { describeBeRefusal, hasErrorCode } from "@/lib/api/describe-error";
import { PERM } from "@/lib/auth/permission-codes";
import { useHasPermission } from "@/lib/auth/my-permissions";

import { Alert } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { CHAT_MESSAGE_BY_CODE, contextKindLabel } from "../labels";
import { useOpenConversation } from "../mutations";
import { CHAT_TEXT_MAX, chatContextKindSchema } from "../schemas";
import { newClientMessageId, signedCopyIntentOf } from "../selectors";
import type { OpenConversationInput } from "../types";

const formSchema = z.object({
  text: z.string().trim().max(CHAT_TEXT_MAX, `Tin nhắn tối đa ${CHAT_TEXT_MAX} ký tự.`),
});
type NewChatForm = z.input<typeof formSchema>;

/** The document named by `?kind=&id=`, both or neither (16 BR-02); a broken link names none. */
export function chatContextOf(kind: string | undefined, id: string | undefined) {
  const parsed = chatContextKindSchema.safeParse(kind);
  const refId = id?.trim();
  return parsed.success && refId ? { contextKind: parsed.data, contextId: refId } : null;
}

interface ChatNewScreenProps {
  kind?: string | undefined;
  id?: string | undefined;
  /** `?attach=`: what the linking page wants sent in the conversation (the signed contract). */
  attach?: string | undefined;
}

/**
 * "Chat với Sale" (C1): opens — or reuses — a conversation, about one of the customer's documents
 * when the page linked here with one. This is the only way a customer attaches a document.
 */
export function ChatNewScreen({ kind, id, attach }: ChatNewScreenProps) {
  const router = useRouter();
  const canCreate = useHasPermission(PERM.chatCreate);
  const open = useOpenConversation();
  const [clientMessageId] = useState(newClientMessageId);
  const [refusal, setRefusal] = useState<{ text: string; contextMissing: boolean } | null>(null);
  const context = chatContextOf(kind, id);
  const brokenLink = (kind !== undefined || id !== undefined) && context === null;
  // The signed copy belongs to a contract's conversation; the thread asks for it once it is open.
  const attachIntent = signedCopyIntentOf(context?.contextKind, attach);
  const { register, handleSubmit, formState } = useForm<NewChatForm>({
    resolver: zodResolver(formSchema),
    defaultValues: { text: "" },
  });

  const submit = handleSubmit(({ text }) => {
    setRefusal(null);
    const first = text.trim();
    const input: OpenConversationInput = {
      ...(context ?? {}),
      ...(first ? { text: first, clientMessageId } : {}),
    };
    open.mutate(input, {
      onSuccess: (conversation) =>
        router.replace(STORE_ROUTES.chat.detail(conversation.id, attachIntent)),
      onError: (failure) =>
        setRefusal({
          text: describeBeRefusal(failure, CHAT_MESSAGE_BY_CODE),
          contextMissing: hasErrorCode(failure, "CHAT_CONTEXT_NOT_FOUND"),
        }),
    });
  });
  const textError = formState.errors.text?.message;

  return (
    <section aria-labelledby="chat-new-title" className="flex min-h-0 flex-1 flex-col">
      <header className="bg-bg-surface border-border-default flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-3 sm:px-6">
        <Link
          href={STORE_ROUTES.chat.list}
          aria-label="Tất cả cuộc trò chuyện"
          className="text-ink-secondary hover:text-ink-primary focus-visible:ring-accent -ml-2 inline-flex size-11 items-center justify-center rounded-full focus-visible:ring-2 focus-visible:outline-none lg:hidden"
        >
          <ChevronLeft aria-hidden className="size-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 id="chat-new-title" className="font-display text-ink-primary text-base font-semibold">
            Cuộc trò chuyện mới
          </h1>
          <p className="text-ink-tertiary text-xs">Sale phụ trách sẽ trả lời bạn ngay tại đây.</p>
        </div>
        {context ? (
          <span className="bg-accent/10 text-accent inline-flex items-center rounded-full px-3 py-1 text-xs font-medium">
            Về: {contextKindLabel(context.contextKind)}
          </span>
        ) : null}
      </header>

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 overflow-y-auto px-4 py-8 text-center sm:px-6">
        <span
          aria-hidden
          className="bg-accent/10 text-accent flex size-16 items-center justify-center rounded-full"
        >
          <MessagesSquare className="size-7" />
        </span>
        <div className="space-y-1.5">
          <p className="font-display text-ink-primary text-lg font-semibold">Nhắn cho Sale</p>
          <p className="text-ink-secondary mx-auto max-w-[46ch] text-sm leading-6">
            {context ? (
              <>
                Về{" "}
                <span className="text-ink-primary font-medium">
                  {contextKindLabel(context.contextKind)}
                </span>{" "}
                bạn đang xem. Sale nhận được chứng từ này cùng tin nhắn của bạn.
              </>
            ) : (
              "Hỏi hàng, yêu cầu báo giá, hợp đồng hay thanh toán: gửi tin nhắn đầu tiên bên dưới."
            )}
          </p>
          {attachIntent ? (
            <p className="text-ink-secondary mx-auto max-w-[46ch] text-sm">
              Mở cuộc trò chuyện rồi chọn file hợp đồng đã ký (PDF hoặc ảnh) để gửi cho Sale.
            </p>
          ) : null}
        </div>
        <div className="w-full max-w-md space-y-2 text-left">
          {brokenLink ? (
            <Alert tone="warning" title="Liên kết thiếu thông tin chứng từ.">
              Cuộc trò chuyện sẽ được mở không gắn chứng từ.
            </Alert>
          ) : null}
          {refusal ? (
            <div role="alert" className="space-y-2">
              <Alert tone="danger" title="Không mở được cuộc trò chuyện.">
                {refusal.text}
              </Alert>
              {refusal.contextMissing ? (
                <Button asChild variant="outline" className="min-h-11 rounded-[var(--r-md)] px-4">
                  <Link href={STORE_ROUTES.chat.new}>{CHAT_WITH_SALES} không gắn chứng từ</Link>
                </Button>
              ) : null}
            </div>
          ) : null}
          {!canCreate ? (
            <Alert tone="warning" title="Tài khoản chưa được mở cuộc trò chuyện.">
              Vui lòng liên hệ cửa hàng để được cấp quyền chat với Sale.
            </Alert>
          ) : null}
        </div>
      </div>

      {canCreate ? (
        <form
          onSubmit={submit}
          noValidate
          className="bg-bg-surface border-border-default border-t px-4 py-3 sm:px-6"
        >
          <Label htmlFor="chat-first-message" className="sr-only">
            Bạn cần Sale hỗ trợ gì? (không bắt buộc)
          </Label>
          <div className="border-border-default focus-within:border-accent flex items-end gap-2 rounded-[var(--r-lg)] border p-1.5 pl-3 transition-colors">
            <Textarea
              id="chat-first-message"
              rows={1}
              maxLength={CHAT_TEXT_MAX}
              placeholder="Nhập tin nhắn cho Sale… (không bắt buộc)"
              aria-invalid={textError ? true : undefined}
              aria-describedby={textError ? "chat-first-message-error" : undefined}
              className="max-h-40 min-h-11 flex-1 resize-none border-0 bg-transparent px-0 py-2.5 shadow-none focus-visible:ring-0"
              onKeyDown={(event) => {
                // Enter sends, Shift+Enter makes a new line, as in any chat.
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  void submit();
                }
              }}
              {...register("text")}
            />
            <Button
              type="submit"
              disabled={open.isPending}
              className="min-h-11 shrink-0 rounded-[var(--r-md)] px-4"
            >
              <SendHorizontal aria-hidden className="size-4" />
              {open.isPending ? "Đang mở..." : "Bắt đầu trò chuyện"}
            </Button>
          </div>
          {textError ? (
            <p id="chat-first-message-error" role="alert" className="text-danger mt-1.5 text-sm">
              {textError}
            </p>
          ) : null}
          <p className="text-ink-tertiary mt-1.5 text-xs">
            Enter để gửi, Shift + Enter để xuống dòng.
          </p>
        </form>
      ) : null}
    </section>
  );
}
