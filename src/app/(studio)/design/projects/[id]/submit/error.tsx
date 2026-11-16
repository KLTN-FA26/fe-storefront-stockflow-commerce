"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import { STORE_ROUTES } from "@/constants";
import { Alert } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { describeDesignError } from "@/features/product-design/errors";

/** A render error (or a chunk that did not load) of the set-submit page: back to the project. */
export default function SubmitSetError({ error, reset }: { error: Error; reset: () => void }) {
  const id = useParams<{ id?: string }>()?.id;
  return (
    <main className="mx-auto w-full max-w-xl space-y-5 p-4 sm:p-6">
      <Alert tone="danger" title="Không mở được trang gửi duyệt cả bộ">
        {describeDesignError(error)}
      </Alert>
      <div className="flex flex-wrap gap-3">
        <Button asChild variant="outline" className="min-h-11 rounded-[var(--r-md)] px-4">
          <Link href={id ? STORE_ROUTES.design.project(id) : STORE_ROUTES.design.projects}>
            {id ? "Về dự án" : "Về danh sách dự án"}
          </Link>
        </Button>
        <Button className="min-h-11 rounded-[var(--r-md)] px-4" onClick={() => reset()}>
          Thử lại
        </Button>
      </div>
    </main>
  );
}
