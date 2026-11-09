"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { parseAsInteger, parseAsStringLiteral, useQueryStates } from "nuqs";
import { Plus } from "lucide-react";

import { APP_ROUTES, STORE_ROUTES } from "@/constants";
import { Alert } from "@/components/shared";
import { PageShell } from "@/components/storefront/layout";
import { ListPagination } from "@/components/storefront/list-pagination";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSignedIn } from "@/lib/auth/use-signed-in";
import { cn } from "@/lib/cn";

import { describeDesignError } from "../errors";
import { useCreateRevision } from "../mutations";
import { useDesignList, useDraftCount } from "../queries";
import type { Design, DesignStatus } from "../types";
import { DeleteDesignDialog } from "./delete-design-dialog";
import { DesignCard } from "./design-card";
import {
  DesignListSkeleton,
  DesignLoadError,
  DesignWaitingNotice,
  NoDesignsInTab,
  NoDesignsYet,
} from "./design-list-states";
import { LauncherSignIn } from "./launcher-states";
import { NewDesignDialog, type DesignableProduct } from "./new-design-dialog";

/** Twelve divides the one-, two- and three-column grids evenly. */
export const DESIGN_PAGE_SIZE = 12;

const TAB_IDS = ["all", "drafts", "pending", "approved"] as const;
type Tab = (typeof TAB_IDS)[number];

/** A tab is a status of the docs' lifecycle (spec §6.3); ARCHIVED is never listed. */
const TABS: Record<Tab, { label: string; status: DesignStatus | undefined }> = {
  all: { label: "Tất cả", status: undefined },
  drafts: { label: "Bản nháp", status: "DRAFT" },
  pending: { label: "Chờ duyệt", status: "PENDING_REVIEW" },
  approved: { label: "Đã duyệt", status: "APPROVED" },
};

const toTab = (value: string): Tab => TAB_IDS.find((id) => id === value) ?? "all";

const CRUMBS = [{ label: "Trang chủ", href: APP_ROUTES.home }, { label: "Thiết kế của tôi" }];

const urlState = {
  tab: parseAsStringLiteral(TAB_IDS).withDefault("all"),
  page: parseAsInteger.withDefault(1),
};

type DesignListScreenProps = { products: DesignableProduct[] };

/**
 * `/design` (spec §6.3): signed-in customers only (ruling R18). The design mock never answers 401,
 * so a visitor gets the launcher's sign-in prompt, which brings them back here, and nothing is read.
 */
export function DesignListScreen(props: DesignListScreenProps) {
  const signedIn = useSignedIn();
  if (signedIn) return <SignedInDesignList {...props} />;
  return (
    <PageShell breadcrumbs={CRUMBS} title="Thiết kế của tôi">
      {signedIn === undefined ? (
        <DesignListSkeleton />
      ) : (
        <LauncherSignIn from={STORE_ROUTES.design.list} />
      )}
    </PageShell>
  );
}

function SignedInDesignList({ products }: DesignListScreenProps) {
  const router = useRouter();
  const [url, setUrl] = useQueryStates(urlState, { history: "push" });
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Design | null>(null);
  const revision = useCreateRevision();
  const draftCount = useDraftCount();
  const tab = url.tab;
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

  const revise = (design: Design) =>
    revision.mutate(design.id, {
      onSuccess: (next) => router.push(STORE_ROUTES.design.detail(next.id)),
    });

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
      <NoDesignsYet />
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
        {data.items.map((design) => (
          <li key={design.id}>
            <DesignCard
              design={design}
              onDelete={setDeleting}
              onRevise={revise}
              revising={revision.isPending && revision.variables === design.id}
            />
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
      subtitle="Tiếp tục chỉnh sửa, gửi duyệt và theo dõi các thiết kế của bạn."
      actions={
        <Button
          type="button"
          className="min-h-11 rounded-[var(--r-md)] px-5"
          onClick={() => setCreating(true)}
        >
          <Plus aria-hidden className="size-4" />
          Thiết kế mới
        </Button>
      }
    >
      {draftCount.data ? (
        <p className="text-ink-secondary mb-4 text-sm tabular-nums">
          {draftCount.data.drafts}/{draftCount.data.limit} bản nháp
        </p>
      ) : null}
      {revision.error ? (
        <Alert tone="danger" className="mb-4">
          {describeDesignError(revision.error)}
        </Alert>
      ) : null}
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
      <DeleteDesignDialog design={deleting} onClose={() => setDeleting(null)} />
      <NewDesignDialog products={products} open={creating} onOpenChange={setCreating} />
    </PageShell>
  );
}
