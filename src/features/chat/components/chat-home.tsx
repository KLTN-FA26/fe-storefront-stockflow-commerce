import Link from "next/link";
import { MessagesSquare } from "lucide-react";

import { STORE_ROUTES } from "@/constants";
import { Button } from "@/components/ui/button";

/** The right pane of `/chat` before a conversation is picked (desktop only: a phone shows the list there). */
export function ChatHome() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
      <span
        aria-hidden
        className="bg-accent/10 text-accent mb-5 flex size-16 items-center justify-center rounded-full"
      >
        <MessagesSquare className="size-7" />
      </span>
      <h1 className="font-display text-ink-primary text-lg font-semibold">
        Chọn một cuộc trò chuyện
      </h1>
      <p className="text-ink-secondary mt-1.5 max-w-[42ch] text-sm leading-6">
        Mở một cuộc trò chuyện bên trái để xem tin nhắn, hoặc bắt đầu cuộc mới để hỏi hàng, báo giá
        và đơn hàng.
      </p>
      <Button asChild className="mt-6 min-h-11 rounded-[var(--r-md)] px-5">
        <Link href={STORE_ROUTES.chat.new}>Cuộc trò chuyện mới</Link>
      </Button>
    </div>
  );
}
