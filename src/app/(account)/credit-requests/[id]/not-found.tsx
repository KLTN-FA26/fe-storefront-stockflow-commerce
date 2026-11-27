import Link from "next/link";

import { STORE_ROUTES } from "@/constants";
import { EmptyState } from "@/components/shared";
import { Button } from "@/components/ui/button";

export default function CreditRequestNotFound() {
  return (
    <EmptyState
      title="Không tìm thấy đề nghị"
      description="Đề nghị không tồn tại hoặc không thuộc tài khoản của bạn."
      action={
        <Button asChild className="min-h-11 rounded-[var(--r-md)] px-5">
          <Link href={STORE_ROUTES.account.home}>Về hồ sơ của tôi</Link>
        </Button>
      }
    />
  );
}
