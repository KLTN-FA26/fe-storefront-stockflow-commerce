"use client";

import Link from "next/link";

import { STORE_ROUTES } from "@/constants";
import { Alert, PageContainer } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { describeError } from "@/features/order";

export default function OrdersError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <PageContainer className="max-w-4xl space-y-6">
      <Alert tone="danger" title="Không hiển thị được danh sách đơn hàng">
        {describeError(error)}
      </Alert>
      <div className="flex flex-wrap gap-3">
        {/* A link, not router.back(): opened from a bookmark or a new tab there is no "back". */}
        <Button asChild variant="outline" className="min-h-11 rounded-full px-4">
          <Link href={STORE_ROUTES.account.home}>Về tài khoản</Link>
        </Button>
        <Button className="min-h-11 rounded-full px-4" onClick={() => reset()}>
          Thử lại
        </Button>
      </div>
    </PageContainer>
  );
}
