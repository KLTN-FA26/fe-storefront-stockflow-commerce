"use client";

import Link from "next/link";

import { STORE_ROUTES } from "@/constants";
import { Alert } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { describeDesignError } from "@/features/product-design/errors";

export default function DesignStudioError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto w-full max-w-xl space-y-5 p-4 sm:p-6">
      <Alert tone="danger" title="Không mở được trình thiết kế">
        {describeDesignError(error)}
      </Alert>
      <div className="flex flex-wrap gap-3">
        {/* A link, not router.back(): opened from a bookmark or a new tab there is no "back". */}
        <Button asChild variant="outline" className="min-h-11 rounded-[var(--r-md)] px-4">
          <Link href={STORE_ROUTES.design.list}>Về thiết kế của tôi</Link>
        </Button>
        <Button className="min-h-11 rounded-[var(--r-md)] px-4" onClick={() => reset()}>
          Thử lại
        </Button>
      </div>
    </main>
  );
}
