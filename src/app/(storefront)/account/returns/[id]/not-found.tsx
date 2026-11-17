import Link from "next/link";

import { STORE_ROUTES } from "@/constants";
import { EmptyState } from "@/components/shared";
import { Button } from "@/components/ui/button";

export default function ReturnDetailNotFound() {
  return (
    <div className="max-w-5xl">
      <EmptyState
        title="Không tìm thấy yêu cầu trả hàng"
        description="Yêu cầu không tồn tại hoặc không thuộc tài khoản của bạn."
        action={
          <Button asChild className="min-h-11 rounded-[var(--r-md)] px-5">
            <Link href={STORE_ROUTES.account.returns.list}>Về danh sách trả hàng</Link>
          </Button>
        }
      />
    </div>
  );
}
