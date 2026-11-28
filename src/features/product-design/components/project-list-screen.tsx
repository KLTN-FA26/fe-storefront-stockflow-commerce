"use client";

import { useEffect, useState } from "react";
import { useQueryStates } from "nuqs";
import { Plus } from "lucide-react";

import { STORE_ROUTES } from "@/constants";
import { ListPagination } from "@/components/storefront/list-pagination";
import { PageShell } from "@/components/storefront/layout";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/cn";
import { useSignedIn } from "@/lib/auth/use-signed-in";

import { useProjects } from "../queries";
import { CreateProjectDialog } from "./create-project-dialog";
import { DesignAreaSkeleton } from "./design-area-skeleton";
import { DesignSectionSwitch } from "./design-section-switch";
import { DesignWaitingNotice } from "./design-list-states";
import { LauncherSignIn } from "./launcher-states";
import { ProjectCard } from "./project-card";
import {
  NoClosedProjects,
  NoProjectsYet,
  ProjectListSkeleton,
  ProjectLoadError,
} from "./project-list-states";
import {
  PROJECT_TAB_IDS,
  PROJECT_TABS,
  projectListUrlState,
  toProjectTab,
} from "./project-list-tabs";

/** Twelve divides the one-, two- and three-column grids evenly. */
const PROJECT_PAGE_SIZE = 12;

const TITLE = "Dự án thiết kế";

/** `/design/projects`: signed-in customers only, like "Thiết kế của tôi" (ruling R18). */
export function ProjectListScreen() {
  const signedIn = useSignedIn();
  if (signedIn) return <SignedInProjectList />;
  if (signedIn === undefined) return <DesignAreaSkeleton section="projects" />;
  return (
    <PageShell title={TITLE}>
      <DesignSectionSwitch current="projects" />
      <LauncherSignIn from={STORE_ROUTES.design.projects} />
    </PageShell>
  );
}

function SignedInProjectList() {
  const [url, setUrl] = useQueryStates(projectListUrlState, { history: "push" });
  const [creating, setCreating] = useState(false);
  const tab = url.tab;
  // Never send page < 1 to the BE, whatever the URL says.
  const page = url.page >= 1 ? url.page : 1;
  const list = useProjects({ page, size: PROJECT_PAGE_SIZE, status: PROJECT_TABS[tab].status });
  const { data, isPending, isPaused, isFetching, isPlaceholderData, error, refetch } = list;

  // Bring an out-of-range URL page back to a real one (replace, so Back skips the bad URL).
  useEffect(() => {
    if (url.page !== page) void setUrl({ page }, { history: "replace" });
    else if (data && !isPlaceholderData && page > Math.max(data.totalPages, 1)) {
      void setUrl({ page: Math.max(data.totalPages, 1) }, { history: "replace" });
    }
  }, [url.page, page, data, isPlaceholderData, setUrl]);

  const showActive = () => void setUrl({ tab: null, page: null });
  let body;
  // A kept-previous page with nothing in it is the other tab's answer: do not show it as this tab's.
  // Another tab's cards (kept as placeholder while this tab loads) must not stand in for its own.
  const otherTabShown =
    isPlaceholderData && data?.items.some((p) => p.status !== PROJECT_TABS[tab].status) === true;
  if (isPending || (isPlaceholderData && data?.totalElements === 0) || otherTabShown) {
    body = (
      <div className="space-y-4">
        {isPaused && <DesignWaitingNotice />}
        <ProjectListSkeleton />
      </div>
    );
  } else if (error && !data) {
    body = <ProjectLoadError error={error} onRetry={() => void refetch()} retrying={isFetching} />;
  } else if (!data || data.totalElements === 0) {
    body = tab === "active" ? <NoProjectsYet /> : <NoClosedProjects onShowActive={showActive} />;
  } else {
    body = (
      <>
        <ul
          aria-label="Danh sách dự án"
          aria-busy={isPlaceholderData}
          className={cn(
            "grid items-start gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3",
            isPlaceholderData && "opacity-60",
          )}
        >
          {data.items.map((project) => (
            <li key={project.id}>
              <ProjectCard project={project} />
            </li>
          ))}
        </ul>
        <ListPagination
          label="Phân trang dự án"
          page={data.page}
          totalPages={data.totalPages}
          hasPrevious={data.hasPrevious}
          hasNext={data.hasNext}
          busy={isPlaceholderData}
          onPageChange={(next) => void setUrl({ page: next }, { scroll: true })}
        />
      </>
    );
  }

  return (
    <PageShell
      title={TITLE}
      subtitle="Gom các bản thiết kế của một bộ sản phẩm và gửi duyệt cả bộ."
      actions={
        <Button
          type="button"
          className="min-h-11 rounded-[var(--r-md)] px-5"
          onClick={() => setCreating(true)}
        >
          <Plus aria-hidden className="size-4" />
          Tạo dự án
        </Button>
      }
    >
      <DesignSectionSwitch current="projects" />
      <Tabs
        value={tab}
        onValueChange={(next) => void setUrl({ tab: toProjectTab(next), page: null })}
        className="gap-5"
      >
        <TabsList
          aria-label="Lọc dự án theo trạng thái"
          className="bg-bg-muted h-auto p-1 group-data-horizontal/tabs:h-auto"
        >
          {PROJECT_TAB_IDS.map((id) => (
            <TabsTrigger
              key={id}
              value={id}
              className="text-ink-secondary hover:text-ink-primary data-active:bg-bg-surface data-active:text-ink-primary focus-visible:ring-accent/40 min-h-10 flex-none rounded-[var(--r-md)] px-4 text-sm focus-visible:border-transparent focus-visible:ring-2 focus-visible:outline-none data-active:shadow-sm"
            >
              {PROJECT_TABS[id].label}
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
      <CreateProjectDialog open={creating} onOpenChange={setCreating} />
    </PageShell>
  );
}
