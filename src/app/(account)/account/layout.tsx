import { AccountSidebar } from "@/components/storefront/account-sidebar";

import type { ReactNode } from "react";

/**
 * The account area, laid out like the back office: on desktop a full-height navigation rail flush with the left edge of
 * the window, under the site header, and the page beside it. On phones the rail becomes a strip of tabs above the
 * page. On desktop the area is exactly the window under the header: the window never scrolls, the page column does,
 * and lists run at full length in it. Cards here are outlined only (`--card-shadow: none`).
 */
export default function AccountLayout({ children }: { children: ReactNode }) {
  return (
    <div className="[--card-shadow:none] lg:grid lg:h-[calc(100dvh-var(--header-h))] lg:grid-cols-[15rem_minmax(0,1fr)] lg:overflow-hidden">
      <AccountSidebar />
      <div data-account-column className="min-w-0 px-4 py-5 sm:px-6 lg:overflow-y-auto lg:px-10 lg:py-8">
        {/* Centred in the space beside the rail, so a wide window does not leave the page hugging the rail. */}
        <div className="mx-auto w-full">{children}</div>
      </div>
    </div>
  );
}
