import Link from "next/link";

import { STORE_ROUTES } from "@/constants";
import { EmptyState } from "@/components/shared";
import { Button } from "@/components/ui/button";

export default function OrdersNotFound() {
  return (
    <div className="max-w-5xl">
      <EmptyState
        title="Không tìm thấy đơn hàng"
        description="Đơn hàng không tồn tại hoặc không thuộc tài khoản của bạn."
        action={
          <Button asChild className="min-h-11 rounded-[var(--r-md)] px-5">
            <Link href={STORE_ROUTES.account.orders.list}>Quay lại danh sách đơn hàng</Link>
          </Button>
        }
      />
    </div>
  );
}
