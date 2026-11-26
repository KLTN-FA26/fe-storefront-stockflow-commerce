import Link from "next/link";
import { SearchX } from "lucide-react";

import { STORE_ROUTES } from "@/constants";
import { EmptyState } from "@/components/shared";
import { StorefrontShell } from "@/components/storefront/storefront-shell";
import { Button } from "@/components/ui/button";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Không tìm thấy trang" };

/**
 * Any address the storefront does not have, and any page that calls `notFound()` (an order, a quote or a return that is
 * missing or belongs to someone else): in Vietnamese, with the site's menu and the way back, instead of the framework's
 * bare English "404" page. The route groups have no not-found file of their own, so this root one renders inside the root
 * layout alone, which has no header or footer: it brings the storefront shell itself.
 */
export default function NotFound() {
  return (
    <StorefrontShell>
      <EmptyState
        className="mx-auto min-h-[50dvh] max-w-lg"
        icon={<SearchX />}
        title="Không tìm thấy trang"
        description="Đường dẫn này không còn hoặc không đúng. Bạn có thể về trang chủ hoặc xem đơn hàng của mình."
        action={
          <div className="flex flex-wrap justify-center gap-3">
            <Button asChild className="min-h-11 rounded-[var(--r-md)] px-5">
              <Link href="/">Về trang chủ</Link>
            </Button>
            <Button asChild variant="outline" className="min-h-11 rounded-[var(--r-md)] px-5">
              <Link href={STORE_ROUTES.account.orders.list}>Đơn hàng của tôi</Link>
            </Button>
          </div>
        }
      />
    </StorefrontShell>
  );
}
