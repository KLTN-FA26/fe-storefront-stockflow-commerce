"use client";

import Link from "next/link";
import { MessageCirclePlus } from "lucide-react";
import { parseAsInteger, useQueryState } from "nuqs";

import { CHAT_WITH_SALES, STORE_ROUTES } from "@/constants";
import { PERM } from "@/lib/auth/permission-codes";
import { useHasPermission } from "@/lib/auth/my-permissions";

import { EmptyState } from "@/components/shared";
import { ListPagination } from "@/components/storefront/list-pagination";
import { PageShell, SurfaceCard } from "@/components/storefront/layout";
import { Button } from "@/components/ui/button";

import { CHAT_PAGE_SIZE, useMyConversations } from "../queries";
import { ConversationListSkeleton, LoadError } from "./chat-states";
import { ConversationRow } from "./conversation-row";
import { ResponseExpectation } from "./response-expectation";

const pageParser = parseAsInteger.withDefault(1).withOptions({ history: "push", scroll: true });

function NewChatButton() {
  return (
    <Button asChild className="min-h-11 rounded-[var(--r-md)] px-4">
      <Link href={STORE_ROUTES.chat.new}>
        <MessageCirclePlus aria-hidden className="size-4" />
        Chat với Sale
      </Link>
    </Button>
  );
}

/** The customer's conversations (C2), the most recently active first, ended ones shown closed. */
export function ChatListScreen() {
  const canRead = useHasPermission(PERM.chatRead);
  const canCreate = useHasPermission(PERM.chatCreate);
  const [urlPage, setPage] = useQueryState("page", pageParser);
  const page = Number.isInteger(urlPage) && urlPage >= 1 ? urlPage : 1;
  const list = useMyConversations({ page, size: CHAT_PAGE_SIZE }, canRead);
  const withinBusinessHours = list.data?.items[0]?.withinBusinessHours;

  return (
    <PageShell
      width="narrow"
      title={CHAT_WITH_SALES}
      subtitle="Hỏi hàng, nhận báo giá, hợp đồng và thông tin thanh toán ngay trong cuộc trò chuyện."
      actions={canCreate ? <NewChatButton /> : undefined}
    >
      <div className="space-y-3">
        <ResponseExpectation withinBusinessHours={withinBusinessHours} />
        {!canRead ? (
          <EmptyState
            title="Tài khoản chưa được dùng chat"
            description="Vui lòng liên hệ cửa hàng để được cấp quyền trò chuyện với Sale."
          />
        ) : list.isPending ? (
          <ConversationListSkeleton />
        ) : list.error && !list.data ? (
          <LoadError
            title="Không tải được danh sách cuộc trò chuyện"
            error={list.error}
            onRetry={() => void list.refetch()}
          />
        ) : !list.data || list.data.items.length === 0 ? (
          <EmptyState
            title="Bạn chưa có cuộc trò chuyện nào"
            description="Nhắn cho Sale để hỏi hàng, yêu cầu báo giá hoặc hỗ trợ đơn hàng."
            action={canCreate ? <NewChatButton /> : undefined}
          />
        ) : (
          <>
            <SurfaceCard padded={false} className="overflow-hidden">
              <ul className="divide-border-default divide-y">
                {list.data.items.map((conversation) => (
                  <li key={conversation.id}>
                    <ConversationRow conversation={conversation} />
                  </li>
                ))}
              </ul>
            </SurfaceCard>
            <ListPagination
              label="Phân trang cuộc trò chuyện"
              page={list.data.page}
              totalPages={list.data.totalPages}
              hasPrevious={list.data.hasPrevious}
              hasNext={list.data.hasNext}
              busy={list.isPlaceholderData}
              onPageChange={(next) => void setPage(next)}
            />
          </>
        )}
      </div>
    </PageShell>
  );
}
