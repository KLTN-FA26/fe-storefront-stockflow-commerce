"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { STORE_ROUTES } from "@/constants";
import { describeBeRefusal, hasErrorCode } from "@/lib/api/describe-error";
import { PERM } from "@/lib/auth/permission-codes";
import { useHasPermission } from "@/lib/auth/my-permissions";

import { Alert } from "@/components/shared";
import { PageShell, SurfaceCard } from "@/components/storefront/layout";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { CHAT_MESSAGE_BY_CODE, contextKindLabel } from "../labels";
import { useOpenConversation } from "../mutations";
import { CHAT_TEXT_MAX, chatContextKindSchema } from "../schemas";
import { newClientMessageId } from "../selectors";
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
}

/**
 * "Chat với Sale" (C1): opens — or reuses — a conversation, about one of the customer's documents
 * when the page linked here with one. This is the only way a customer attaches a document.
 */
export function ChatNewScreen({ kind, id }: ChatNewScreenProps) {
  const router = useRouter();
  const canCreate = useHasPermission(PERM.chatCreate);
  const open = useOpenConversation();
  const [clientMessageId] = useState(newClientMessageId);
  const [refusal, setRefusal] = useState<{ text: string; contextMissing: boolean } | null>(null);
  const context = chatContextOf(kind, id);
  const brokenLink = (kind !== undefined || id !== undefined) && context === null;
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
      onSuccess: (conversation) => router.replace(STORE_ROUTES.chat.detail(conversation.id)),
      onError: (failure) =>
        setRefusal({
          text: describeBeRefusal(failure, CHAT_MESSAGE_BY_CODE),
          contextMissing: hasErrorCode(failure, "CHAT_CONTEXT_NOT_FOUND"),
        }),
    });
  });
  const textError = formState.errors.text?.message;

  return (
    <PageShell
      width="narrow"
      breadcrumbs={[
        { label: "Chat với Sale", href: STORE_ROUTES.chat.list },
        { label: "Cuộc trò chuyện mới" },
      ]}
      title="Chat với Sale"
      subtitle="Sale phụ trách sẽ trả lời bạn ngay trong cuộc trò chuyện."
    >
      <SurfaceCard as="section" className="space-y-4">
        {context ? (
          <p className="text-ink-secondary text-sm">
            Về:{" "}
            <span className="text-ink-primary font-medium">
              {contextKindLabel(context.contextKind)}
            </span>{" "}
            bạn đang xem. Sale nhận được chứng từ này cùng tin nhắn của bạn.
          </p>
        ) : null}
        {brokenLink ? (
          <Alert tone="warning" title="Liên kết thiếu thông tin chứng từ.">
            Cuộc trò chuyện sẽ được mở không gắn chứng từ.
          </Alert>
        ) : null}
        {!canCreate ? (
          <Alert tone="warning" title="Tài khoản chưa được mở cuộc trò chuyện.">
            Vui lòng liên hệ cửa hàng để được cấp quyền chat với Sale.
          </Alert>
        ) : (
          <form onSubmit={submit} noValidate className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="chat-first-message" className="text-sm font-medium">
                Bạn cần Sale hỗ trợ gì? (không bắt buộc)
              </Label>
              <Textarea
                id="chat-first-message"
                rows={4}
                maxLength={CHAT_TEXT_MAX}
                aria-invalid={textError ? true : undefined}
                aria-describedby={textError ? "chat-first-message-error" : undefined}
                {...register("text")}
              />
              {textError ? (
                <p id="chat-first-message-error" role="alert" className="text-danger text-sm">
                  {textError}
                </p>
              ) : null}
            </div>
            {refusal ? (
              <div role="alert" className="space-y-2">
                <Alert tone="danger" title="Không mở được cuộc trò chuyện.">
                  {refusal.text}
                </Alert>
                {refusal.contextMissing ? (
                  <Button asChild variant="outline" className="min-h-11 rounded-[var(--r-md)] px-4">
                    <Link href={STORE_ROUTES.chat.new}>Chat với Sale không gắn chứng từ</Link>
                  </Button>
                ) : null}
              </div>
            ) : null}
            <Button
              type="submit"
              disabled={open.isPending}
              className="min-h-11 rounded-[var(--r-md)] px-4"
            >
              {open.isPending ? "Đang mở..." : "Bắt đầu trò chuyện"}
            </Button>
          </form>
        )}
      </SurfaceCard>
    </PageShell>
  );
}
