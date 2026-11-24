"use client";

import Link from "next/link";
import { MessageCirclePlus } from "lucide-react";
import { parseAsInteger, useQueryState } from "nuqs";

import { CHAT_WITH_SALES, STORE_ROUTES } from "@/constants";
import { PERM } from "@/lib/auth/permission-codes";
import { useHasPermission } from "@/lib/auth/my-permissions";

import { EmptyState } from "@/components/shared";
import { ListPagination } from "@/components/storefront/list-pagination";
import { Button } from "@/components/ui/button";

import { CHAT_PAGE_SIZE, useMyConversations } from "../queries";
import { ConversationListSkeleton, LoadError } from "./chat-states";
import { ConversationRow } from "./conversation-row";
import { ResponseExpectation } from "./response-expectation";

const pageParser = parseAsInteger.withDefault(1).withOptions({ history: "push", scroll: false });

/** The list's way to a new conversation: an icon at the top right of the column. */
function NewChatButton() {
  return (
    <Button
      asChild
      variant="ghost"
      className="text-accent hover:text-accent size-11 rounded-full p-0"
      title="Cuộc trò chuyện mới"
    >
      <Link href={STORE_ROUTES.chat.new} aria-label="Cuộc trò chuyện mới với Sale">
        <MessageCirclePlus aria-hidden className="size-5" />
      </Link>
    </Button>
  );
}

/**
 * The customer's conversations (C2), the most recently active first, ended ones shown closed: the left column of the
 * chat area, as a messaging app's inbox. The open conversation is highlighted.
 */
export function ChatListScreen() {
  const canRead = useHasPermission(PERM.chatRead);
  const canCreate = useHasPermission(PERM.chatCreate);
  const [urlPage, setPage] = useQueryState("page", pageParser);
  const page = Number.isInteger(urlPage) && urlPage >= 1 ? urlPage : 1;
  const list = useMyConversations({ page, size: CHAT_PAGE_SIZE }, canRead);
  const withinBusinessHours = list.data?.items[0]?.withinBusinessHours;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-border-default flex items-center justify-between gap-2 border-b px-4 py-2.5">
        <h1 className="font-display text-ink-primary text-lg font-semibold">{CHAT_WITH_SALES}</h1>
        {canCreate ? <NewChatButton /> : null}
      </div>
      <div className="border-border-default border-b px-4 py-2">
        <ResponseExpectation withinBusinessHours={withinBusinessHours} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {!canRead ? (
          <EmptyState
            title="Tài khoản chưa được dùng chat"
            description="Vui lòng liên hệ cửa hàng để được cấp quyền trò chuyện với Sale."
          />
        ) : list.isPending ? (
          <div className="p-4">
            <ConversationListSkeleton />
          </div>
        ) : list.error && !list.data ? (
          <div className="p-4">
            <LoadError
              title="Không tải được danh sách cuộc trò chuyện"
              error={list.error}
              onRetry={() => void list.refetch()}
            />
          </div>
        ) : !list.data || list.data.items.length === 0 ? (
          <EmptyState
            title="Bạn chưa có cuộc trò chuyện nào"
            description="Nhắn cho Sale để hỏi hàng, yêu cầu báo giá hoặc hỗ trợ đơn hàng."
          />
        ) : (
          <>
            <ul className="p-2">
              {list.data.items.map((conversation) => (
                <li key={conversation.id}>
                  <ConversationRow conversation={conversation} />
                </li>
              ))}
            </ul>
            {list.data.totalPages > 1 ? (
              <div className="px-3 pb-3">
                <ListPagination
                  label="Phân trang cuộc trò chuyện"
                  page={list.data.page}
                  totalPages={list.data.totalPages}
                  hasPrevious={list.data.hasPrevious}
                  hasNext={list.data.hasNext}
                  busy={list.isPlaceholderData}
                  onPageChange={(next) => void setPage(next)}
                />
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
