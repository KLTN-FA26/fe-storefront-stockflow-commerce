"use client";

import Link from "next/link";

import { STORE_ROUTES } from "@/constants";
import { Alert } from "@/components/shared";
import { Button } from "@/components/ui/button";

export default function CreditRequestError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="space-y-6">
      <Alert tone="danger" title="Không hiển thị được đề nghị cấp hạn mức">
        Vui lòng thử lại sau ít phút.
      </Alert>
      <div className="flex flex-wrap gap-3">
        <Button asChild variant="outline" className="min-h-11 rounded-[var(--r-md)] px-4">
          <Link href={STORE_ROUTES.account.home}>Về hồ sơ của tôi</Link>
        </Button>
        <Button className="min-h-11 rounded-[var(--r-md)] px-4" onClick={() => reset()}>
          Thử lại
        </Button>
      </div>
    </div>
  );
}
