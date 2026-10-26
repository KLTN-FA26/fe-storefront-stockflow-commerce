"use client";

import { useEffect } from "react";
import { parseAsInteger, parseAsStringLiteral, useQueryStates } from "nuqs";

import { APP_ROUTES } from "@/constants";
import { PageShell } from "@/components/storefront/layout";
import { ListPagination } from "@/components/storefront/list-pagination";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/cn";
import { useIsMock } from "@/providers/app-providers";

import { designCapabilities } from "../capabilities";
import { useDesignList } from "../queries";
import type { DesignStatus } from "../types";
import { DesignCard } from "./design-card";
import {
  DesignListSkeleton,
  DesignLoadError,
  DesignWaitingNotice,
  NoDesignsInTab,
  NoDesignsYet,
} from "./design-list-states";

/** Twelve divides the one-, two- and three-column grids evenly. */
export const DESIGN_PAGE_SIZE = 12;

const TAB_IDS = ["all", "editing", "waiting", "confirmed"] as const;
type Tab = (typeof TAB_IDS)[number];

/** A tab is a BE status (P6 filter); "editing" is DRAFT, which covers every step before Sales sends it. */
const TABS: Record<Tab, { label: string; status: DesignStatus | undefined }> = {
  all: { label: "Tất cả", status: undefined },
  editing: { label: "Đang thiết kế", status: "DRAFT" },
  waiting: { label: "Chờ bạn xác nhận", status: "SUBMITTED" },
  confirmed: { label: "Đã chốt", status: "APPROVED" },
};

const toTab = (value: string): Tab => TAB_IDS.find((id) => id === value) ?? "all";

const CRUMBS = [{ label: "Trang chủ", href: APP_ROUTES.home }, { label: "Thiết kế của tôi" }];

const urlState = {
  tab: parseAsStringLiteral(TAB_IDS).withDefault("all"),
  page: parseAsInteger.withDefault(1),
};

export function DesignListScreen() {
  const capabilities = designCapabilities(useIsMock());
  const [url, setUrl] = useQueryStates(urlState, { history: "push" });
  // The status filter is a proposed endpoint feature: without it the tab in the URL is ignored.
  const tab = capabilities.statusFilter ? url.tab : "all";
  // Never send page < 1 to the BE, whatever the URL says.
  const page = url.page >= 1 ? url.page : 1;
  const { data, isPending, isPaused, isFetching, isPlaceholderData, error, refetch } =
    useDesignList({ page, size: DESIGN_PAGE_SIZE, status: TABS[tab].status });

  // Bring an out-of-range URL page back to a real one (replace, so Back skips the bad URL).
  useEffect(() => {
    if (url.page !== page) void setUrl({ page }, { history: "replace" });
    else if (data && !isPlaceholderData && page > Math.max(data.totalPages, 1)) {
      void setUrl({ page: Math.max(data.totalPages, 1) }, { history: "replace" });
    }
  }, [url.page, page, data, isPlaceholderData, setUrl]);

  // A kept-previous page with nothing in it is the other tab's answer: do not show it as this tab's.
  const loading = isPending || (isPlaceholderData && data?.totalElements === 0);
  const body = loading ? (
    <div className="space-y-4">
      {isPaused && <DesignWaitingNotice />}
      <DesignListSkeleton />
    </div>
  ) : error && !data ? (
    <div className="space-y-3">
      <DesignLoadError error={error} onRetry={() => void refetch()} retrying={isFetching} />
      {page > 1 && (
        <Button
          type="button"
          variant="ghost"
          className="min-h-11 rounded-[var(--r-md)] px-4"
          onClick={() => void setUrl({ page: null })}
        >
          Về trang đầu
        </Button>
      )}
    </div>
  ) : !data || data.totalElements === 0 ? (
    tab === "all" ? (
      <NoDesignsYet selfService={capabilities.selfService} />
    ) : (
      <NoDesignsInTab onShowAll={() => void setUrl({ tab: null, page: null })} />
    )
  ) : (
    <>
      <ul
        aria-label="Danh sách thiết kế"
        aria-busy={isPlaceholderData}
        className={cn(
          "grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3",
          isPlaceholderData && "opacity-60",
        )}
      >
        {data.items.map((draft) => (
          <li key={draft.id}>
            <DesignCard draft={draft} />
          </li>
        ))}
      </ul>
      <ListPagination
        label="Phân trang thiết kế"
        page={data.page}
        totalPages={data.totalPages}
        hasPrevious={data.hasPrevious}
        hasNext={data.hasNext}
        busy={isPlaceholderData}
        onPageChange={(next) => void setUrl({ page: next }, { scroll: true })}
      />
    </>
  );

  return (
    <PageShell
      breadcrumbs={CRUMBS}
      title="Thiết kế của tôi"
      subtitle="Tiếp tục chỉnh sửa, theo dõi kiểm tra kỹ thuật và chốt thiết kế để nhận báo giá."
    >
      {capabilities.statusFilter ? (
        <Tabs
          value={tab}
          onValueChange={(next) => void setUrl({ tab: toTab(next), page: null })}
          className="gap-5"
        >
          <TabsList
            variant="line"
            aria-label="Lọc thiết kế theo trạng thái"
            className="w-full justify-start overflow-x-auto group-data-horizontal/tabs:h-auto"
          >
            {TAB_IDS.map((id) => (
              <TabsTrigger
                key={id}
                value={id}
                className="min-h-11 flex-none px-4 text-base group-data-horizontal/tabs:after:bottom-0"
              >
                {TABS[id].label}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent
            value={tab}
            className="focus-visible:ring-accent focus-visible:ring-offset-bg-base rounded-[var(--r-lg)] text-base focus-visible:ring-2 focus-visible:ring-offset-4"
          >
            {body}
          </TabsContent>
        </Tabs>
      ) : (
        body
      )}
    </PageShell>
  );
}
