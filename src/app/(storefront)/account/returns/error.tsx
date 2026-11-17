"use client";

import Link from "next/link";

import { STORE_ROUTES } from "@/constants";
import { Alert } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { describeReturnError } from "@/lib/returns";

export default function ReturnsError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="max-w-5xl space-y-6">
      <Alert tone="danger" title="Không hiển thị được yêu cầu trả hàng">
        {describeReturnError(error)}
      </Alert>
      <div className="flex flex-wrap gap-3">
        <Button asChild variant="outline" className="min-h-11 rounded-[var(--r-md)] px-4">
          <Link href={STORE_ROUTES.account.orders.list}>Về đơn hàng</Link>
        </Button>
        <Button className="min-h-11 rounded-[var(--r-md)] px-4" onClick={() => reset()}>
          Thử lại
        </Button>
      </div>
    </div>
  );
}
