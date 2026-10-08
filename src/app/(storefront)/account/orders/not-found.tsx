import Link from "next/link";

import { STORE_ROUTES } from "@/constants";
import { EmptyState, PageContainer } from "@/components/shared";
import { Button } from "@/components/ui/button";

export default function OrdersNotFound() {
  return (
    <PageContainer className="max-w-4xl">
      <EmptyState
        title="Không tìm thấy đơn hàng"
        description="Đơn hàng không tồn tại hoặc không thuộc tài khoản của bạn."
        action={
          <Button asChild className="min-h-11 rounded-full px-5">
            <Link href={STORE_ROUTES.account.orders.list}>Quay lại danh sách đơn hàng</Link>
          </Button>
        }
      />
    </PageContainer>
  );
}
