import Link from "next/link";
import { STORE_ROUTES } from "@/constants";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared";

export default function OrderDetailNotFound() {
  return (
    <section className="mx-auto w-full max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
      <EmptyState
        title="Không tìm thấy đơn hàng"
        description="Đơn hàng không tồn tại hoặc bạn không có quyền truy cập."
        action={
          <Button asChild className="rounded-full">
            <Link href={STORE_ROUTES.account.orders.list}>Quay lại danh sách đơn hàng</Link>
          </Button>
        }
      />
    </section>
  );
}
