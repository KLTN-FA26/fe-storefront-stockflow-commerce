import Link from "next/link";
import { MessageCircle } from "lucide-react";

import { CHAT_WITH_SALES, STORE_ROUTES } from "@/constants";
import { EmptyState } from "@/components/shared";
import { Button } from "@/components/ui/button";

/**
 * The BE answers 404 both for a wrong or foreign id and for an order back in DRAFT while Sale
 * redraws its contract (WF-02 FE-3, Q-12: a DRAFT order is not the customer's to see). The page
 * cannot tell them apart, so it words both and offers the chat.
 */
export default function OrderDetailNotFound() {
  return (
    <div>
      <EmptyState
        title="Chưa xem được đơn hàng này"
        description="Đường dẫn có thể không đúng, đơn không thuộc tài khoản của bạn, hoặc Sale đang lập lại hợp đồng cho đơn này. Hãy chat với Sale nếu bạn cần hỏi về đơn."
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button asChild className="min-h-11 rounded-[var(--r-md)] px-5">
              <Link href={STORE_ROUTES.chat.new}>
                <MessageCircle aria-hidden className="mr-2 size-4" />
                {CHAT_WITH_SALES}
              </Link>
            </Button>
            <Button asChild variant="outline" className="min-h-11 rounded-[var(--r-md)] px-5">
              <Link href={STORE_ROUTES.account.orders.list}>Quay lại danh sách đơn hàng</Link>
            </Button>
          </div>
        }
      />
    </div>
  );
}
