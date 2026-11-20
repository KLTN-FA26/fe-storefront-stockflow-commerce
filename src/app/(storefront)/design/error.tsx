"use client";

import Link from "next/link";

import { APP_ROUTES } from "@/constants";
import { Alert } from "@/components/shared";
import { PageShell } from "@/components/storefront/layout";
import { Button } from "@/components/ui/button";
import { describeDesignError } from "@/features/product-design/errors";

/** A render error on the customer's design list. */
export default function DesignListError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <PageShell>
      <div className="mx-auto w-full max-w-xl space-y-5">
        <Alert tone="danger" title="Không mở được trang thiết kế">
          {describeDesignError(error)}
        </Alert>
        <div className="flex flex-wrap gap-3">
          <Button asChild variant="outline" className="min-h-11 rounded-[var(--r-md)] px-4">
            <Link href={APP_ROUTES.home}>Về trang chủ</Link>
          </Button>
          <Button className="min-h-11 rounded-[var(--r-md)] px-4" onClick={() => reset()}>
            Thử lại
          </Button>
        </div>
      </div>
    </PageShell>
  );
}
