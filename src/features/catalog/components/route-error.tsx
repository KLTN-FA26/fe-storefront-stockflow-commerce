"use client";

import Link from "next/link";
import { useQueryErrorResetBoundary } from "@tanstack/react-query";

import { APP_ROUTES } from "@/constants";
import { Alert } from "@/components/shared";
import { PageShell } from "@/components/storefront/layout";
import { Button } from "@/components/ui/button";

import { describeCatalogError } from "../errors";

/**
 * The route error boundary of the catalogue pages. "Thử lại" first clears the failed queries,
 * or the re-render would meet the same cached error and show this page again.
 */
export function CatalogRouteError({
  title,
  heading,
  error,
  reset,
}: {
  title: string;
  heading: string;
  error: Error;
  reset: () => void;
}) {
  const queries = useQueryErrorResetBoundary();
  return (
    <PageShell title={title}>
      <Alert tone="danger" title={heading}>
        {describeCatalogError(error)}
      </Alert>
      <div className="flex flex-wrap gap-3">
        <Button asChild variant="outline" className="min-h-11 rounded-[var(--r-md)] px-4">
          <Link href={APP_ROUTES.home}>Về trang chủ</Link>
        </Button>
        <Button
          className="min-h-11 rounded-[var(--r-md)] px-4"
          onClick={() => {
            queries.reset();
            reset();
          }}
        >
          Thử lại
        </Button>
      </div>
    </PageShell>
  );
}
