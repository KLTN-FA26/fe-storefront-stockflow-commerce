import Link from "next/link";

import { STORE_ROUTES } from "@/constants";
import { EmptyState } from "@/components/shared";
import { Button } from "@/components/ui/button";

export default function QuotesNotFound() {
  return (
    <div className="max-w-5xl">
      <EmptyState
        title="Không tìm thấy báo giá"
        description="Báo giá không tồn tại, chưa được gửi hoặc không thuộc tài khoản của bạn."
        action={
          <Button asChild className="min-h-11 rounded-[var(--r-md)] px-5">
            <Link href={STORE_ROUTES.account.quotes.list}>Quay lại danh sách báo giá</Link>
          </Button>
        }
      />
    </div>
  );
}
