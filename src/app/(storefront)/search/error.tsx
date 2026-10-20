"use client";

import Link from "next/link";

import { APP_ROUTES } from "@/constants";
import { describeCatalogError } from "@/features/catalog";
import { Alert } from "@/components/shared";
import { PageShell } from "@/components/storefront/layout";
import { Button } from "@/components/ui/button";

export default function SearchError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <PageShell title="Tìm kiếm">
      <Alert tone="danger" title="Không tìm kiếm được sản phẩm">
        {describeCatalogError(error)}
      </Alert>
      <div className="flex flex-wrap gap-3">
        <Button asChild variant="outline" className="min-h-11 rounded-[var(--r-md)] px-4">
          <Link href={APP_ROUTES.home}>Về trang chủ</Link>
        </Button>
        <Button className="min-h-11 rounded-[var(--r-md)] px-4" onClick={() => reset()}>
          Thử lại
        </Button>
      </div>
    </PageShell>
  );
}
