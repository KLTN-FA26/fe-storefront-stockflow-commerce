"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { PERM } from "@/lib/auth/permission-codes";
import { useRealtimeConnected } from "@/lib/realtime";
import { useHasPermission } from "@/lib/auth/my-permissions";
import { describeBeRefusal } from "@/lib/api/describe-error";

import { toast } from "@/components/shared/Toast";
import { Button } from "@/components/ui/button";

import { CHAT_MESSAGE_BY_CODE } from "../labels";
import { useMarkRead, useTakeBackMessage } from "../mutations";
import { useConversation, useConversationMessages, useMessageCatchUp } from "../queries";
import { useConversationLive } from "../realtime";
import { acceptsMessages, isEnded, timelineOf } from "../selectors";
import { contractOrdersOf, signedCopiesOf } from "../thread-facts";
import { LoadError, MessagesSkeleton, ThreadSkeleton } from "./chat-states";
import { ThreadComposer } from "./thread-composer";
import { CsatPanel, ReopenOffer } from "./thread-footer";
import { ThreadHeader } from "./thread-header";
import { ThreadLog } from "./thread-log";

/**
 * One conversation (C3, C4): header, messages paged by `seq`, composer. New messages and changed cards come over the
 * socket when there is one (`useConversationLive`), with a slow REST catch-up behind it; without one, the catch-up
 * runs every 5 s. The page fills the window below the header (its route has no footer, L-10).
 */
export function ChatThreadScreen({ conversationId }: { conversationId: string }) {
  const canUpdate = useHasPermission(PERM.chatUpdate);
  const live = useRealtimeConnected();
  const detail = useConversation(conversationId, live);
  useConversationLive(conversationId, detail.data?.assignedAgentId);
  const messages = useConversationMessages(conversationId);
  useMessageCatchUp(conversationId, messages.isSuccess, live);
  const timeline = useMemo(() => timelineOf(messages.data), [messages.data]);
  const signedCopies = useMemo(() => signedCopiesOf(timeline), [timeline]);
  const contexts = detail.data?.contexts;
  const contractOrders = useMemo(
    () => contractOrdersOf(timeline, contexts ?? []),
    [timeline, contexts],
  );
  const { mutate: markRead } = useMarkRead(conversationId);
  const takeBack = useTakeBackMessage(conversationId);
  const [endedByServer, setEndedByServer] = useState(false);
  const marked = useRef(0);
  const newest = timeline.at(-1)?.seq ?? 0;

  // C8 once the newest message is on screen; the marker never moves back.
  useEffect(() => {
    if (!canUpdate || newest <= marked.current) return;
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    marked.current = newest;
    markRead(newest);
  }, [canUpdate, newest, markRead]);

  if (detail.isPending) return <ThreadSkeleton />;
  if (detail.error || !detail.data) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-5 sm:px-6">
        <LoadError
          title="Không mở được cuộc trò chuyện"
          error={detail.error}
          onRetry={() => void detail.refetch()}
          backToList
        />
      </div>
    );
  }

  const conversation = detail.data;
  const writable = acceptsMessages(conversation) && !endedByServer;
  const surveyOnScreen = timeline.some(
    (message) => message.card?.kind === "CSAT_SURVEY" && message.card.state === "OPEN",
  );
  const onTakeBack = (messageId: string) =>
    takeBack.mutate(messageId, {
      onError: (failure) =>
        toast.error(
          "Không thu hồi được tin nhắn",
          describeBeRefusal(failure, CHAT_MESSAGE_BY_CODE),
        ),
    });

  return (
    <section className="mx-auto flex h-[calc(100dvh-var(--header-h))] w-full max-w-3xl flex-col gap-2 px-4 py-3 sm:gap-3 sm:px-6 sm:py-4">
      <ThreadHeader conversation={conversation} contractOrders={contractOrders} />
      <ThreadLog
        conversationId={conversationId}
        timeline={timeline}
        canAct={canUpdate}
        onTakeBack={writable ? onTakeBack : undefined}
        signedCopies={signedCopies}
        before={
          messages.hasNextPage ? (
            <div className="flex justify-center">
              <Button
                type="button"
                variant="ghost"
                className="min-h-11 rounded-[var(--r-md)] px-4"
                disabled={messages.isFetchingNextPage}
                onClick={() => void messages.fetchNextPage()}
              >
                {messages.isFetchingNextPage ? "Đang tải..." : "Xem tin nhắn cũ hơn"}
              </Button>
            </div>
          ) : null
        }
        status={
          messages.isPending ? (
            <MessagesSkeleton />
          ) : messages.error && !messages.data ? (
            <LoadError
              title="Không tải được tin nhắn"
              error={messages.error}
              onRetry={() => void messages.refetch()}
            />
          ) : timeline.length === 0 ? (
            <p className="text-ink-secondary py-8 text-center text-sm">
              Hãy gửi câu hỏi đầu tiên, Sale sẽ phản hồi trong cuộc trò chuyện này.
            </p>
          ) : undefined
        }
        after={
          conversation.canRate && !surveyOnScreen && canUpdate ? (
            <CsatPanel conversationId={conversationId} />
          ) : null
        }
      />
      {!canUpdate ? (
        <p className="text-ink-secondary text-sm">
          Tài khoản của bạn chỉ xem được cuộc trò chuyện, không gửi được tin nhắn.
        </p>
      ) : writable ? (
        <>
          {isEnded(conversation.status) ? (
            <p className="text-ink-secondary text-sm">
              Cuộc trò chuyện đã được giải quyết. Nhắn tiếp để mở lại.
            </p>
          ) : null}
          <ThreadComposer conversationId={conversationId} onEnded={() => setEndedByServer(true)} />
        </>
      ) : (
        <ReopenOffer conversationId={conversationId} onReopened={() => setEndedByServer(false)} />
      )}
    </section>
  );
}
