"use client";

import Link from "next/link";

import { STORE_ROUTES } from "@/constants";
import { Alert } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { describeQuoteError } from "@/features/quote";

export default function QuoteDetailError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="max-w-5xl space-y-6">
      <Alert tone="danger" title="Không hiển thị được báo giá">
        {describeQuoteError(error)}
      </Alert>
      <div className="flex flex-wrap gap-3">
        <Button asChild variant="outline" className="min-h-11 rounded-[var(--r-md)] px-4">
          <Link href={STORE_ROUTES.account.quotes.list}>Về danh sách báo giá</Link>
        </Button>
        <Button className="min-h-11 rounded-[var(--r-md)] px-4" onClick={() => reset()}>
          Thử lại
        </Button>
      </div>
    </div>
  );
}
