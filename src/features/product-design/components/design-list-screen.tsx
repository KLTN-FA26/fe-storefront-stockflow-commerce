"use client";

import { useEffect, useState } from "react";
import { useQueryStates } from "nuqs";

import { STORE_ROUTES } from "@/constants";
import { PageShell } from "@/components/storefront/layout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSignedIn } from "@/lib/auth/use-signed-in";

import { useDesignList } from "../queries";
import type { Design } from "../types";
import { CloneDesignDialog } from "./clone-design-dialog";
import { DeleteDesignDialog } from "./delete-design-dialog";
import { DesignAreaSkeleton } from "./design-area-skeleton";
import { DesignSectionSwitch } from "./design-section-switch";
import { DesignListBody } from "./design-list-body";
import { useDesignRevision } from "./design-list-revision";
import { RevisionError } from "./design-list-states";
import { TAB_IDS, TABS, designListUrlState, toTab } from "./design-list-tabs";
import { LauncherSignIn } from "./launcher-states";
import { NewDesignAction } from "./new-design-action";
import { NewDesignDialog, type DesignableCatalogue } from "./new-design-dialog";

/** Twelve divides the one-, two- and three-column grids evenly. */
export const DESIGN_PAGE_SIZE = 12;

/** The catalogue's printable products, for "Thiết kế mới": the page reads them. */
type DesignListScreenProps = { catalogue: DesignableCatalogue };

/**
 * `/design` (spec §6.3): signed-in customers only (ruling R18). The design mock never answers 401,
 * so a visitor gets the launcher's sign-in prompt, which brings them back here, and nothing is read.
 */
export function DesignListScreen(props: DesignListScreenProps) {
  const signedIn = useSignedIn();
  if (signedIn) return <SignedInDesignList {...props} />;
  if (signedIn === undefined) return <DesignAreaSkeleton section="designs" />;
  return (
    <PageShell title="Thiết kế của tôi">
      <DesignSectionSwitch current="designs" />
      <LauncherSignIn from={STORE_ROUTES.design.list} />
    </PageShell>
  );
}

function SignedInDesignList({ catalogue }: DesignListScreenProps) {
  const [url, setUrl] = useQueryStates(designListUrlState, { history: "push" });
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Design | null>(null);
  const [cloning, setCloning] = useState<Design | null>(null);
  const revision = useDesignRevision();
  const tab = url.tab;
  // Never send page < 1 to the BE, whatever the URL says.
  const page = url.page >= 1 ? url.page : 1;
  const list = useDesignList({ page, size: DESIGN_PAGE_SIZE, status: TABS[tab].status });
  const { data, isPlaceholderData } = list;

  // Bring an out-of-range URL page back to a real one (replace, so Back skips the bad URL).
  useEffect(() => {
    if (url.page !== page) void setUrl({ page }, { history: "replace" });
    else if (data && !isPlaceholderData && page > Math.max(data.totalPages, 1)) {
      void setUrl({ page: Math.max(data.totalPages, 1) }, { history: "replace" });
    }
  }, [url.page, page, data, isPlaceholderData, setUrl]);

  // A failed revision's message lasts until the customer does something else (or dismisses it).
  const nextAction =
    <A extends unknown[]>(action: (...args: A) => void) =>
    (...args: A) => {
      revision.clearError();
      action(...args);
    };

  return (
    <PageShell
      title="Thiết kế của tôi"
      subtitle="Tiếp tục chỉnh sửa, gửi duyệt và theo dõi các thiết kế của bạn."
      actions={<NewDesignAction onCreate={nextAction(() => setCreating(true))} />}
    >
      <DesignSectionSwitch current="designs" />
      {revision.error ? (
        <RevisionError error={revision.error} onDismiss={revision.clearError} />
      ) : null}
      <Tabs
        value={tab}
        onValueChange={nextAction((next: string) => void setUrl({ tab: toTab(next), page: null }))}
        className="gap-5"
      >
        <TabsList
          aria-label="Lọc thiết kế theo trạng thái"
          className="bg-bg-muted h-auto p-1 group-data-horizontal/tabs:h-auto"
        >
          {TAB_IDS.map((id) => (
            <TabsTrigger
              key={id}
              value={id}
              className="text-ink-secondary hover:text-ink-primary data-active:bg-bg-surface data-active:text-ink-primary focus-visible:ring-accent/40 min-h-10 flex-none rounded-[var(--r-md)] px-4 text-sm focus-visible:border-transparent focus-visible:ring-2 focus-visible:outline-none data-active:shadow-sm"
            >
              {TABS[id].label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent
          value={tab}
          className="focus-visible:ring-accent focus-visible:ring-offset-bg-base rounded-[var(--r-lg)] text-base focus-visible:ring-2 focus-visible:ring-offset-4"
        >
          <DesignListBody
            list={list}
            allTab={tab === "all"}
            page={page}
            revision={revision}
            onDelete={nextAction(setDeleting)}
            onClone={nextAction(setCloning)}
            onShowAll={nextAction(() => void setUrl({ tab: null, page: null }))}
            onFirstPage={nextAction(() => void setUrl({ page: null }))}
            onPageChange={nextAction(
              (next: number) => void setUrl({ page: next }, { scroll: true }),
            )}
          />
        </TabsContent>
      </Tabs>
      <DeleteDesignDialog design={deleting} onClose={() => setDeleting(null)} />
      <CloneDesignDialog
        design={cloning}
        open={cloning !== null}
        onOpenChange={(open) => (open ? undefined : setCloning(null))}
        skusOf={catalogue.skusOf}
      />
      <NewDesignDialog catalogue={catalogue} open={creating} onOpenChange={setCreating} />
    </PageShell>
  );
}
