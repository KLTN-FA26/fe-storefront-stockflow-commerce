"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UserCheck } from "lucide-react";
import { useParams, usePathname } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useSignedIn } from "@/lib/auth/use-signed-in";
import { cn } from "@/lib/cn";
import { DESIGN_API_MOCKED } from "@/lib/config";
// Read from the providers: the full-mock switch lives there, and this is its only use in the feature.
import { useIsMock } from "@/providers/app-providers";

import { designKeys, designQuery, useDesign, useDesignList } from "../queries";
import { getMockStorage, resetMockData } from "../simulation";
import { ReviewActions } from "./mock-review-actions";

const PENDING_PAGE = { status: "PENDING_REVIEW", page: 1, size: 10 } as const;

/** The open design: only a design waiting for review can be approved or returned. */
function OpenDesignReview({ id }: { id: string }) {
  const { data: design } = useDesign(id);
  if (!design) return null;
  if (design.status !== "PENDING_REVIEW") {
    return <p className="text-ink-secondary text-sm">Thiết kế này không ở trạng thái chờ duyệt.</p>;
  }
  return <ReviewActions designId={id} />;
}

/** On /design: the caller's designs waiting for review, first page. */
function PendingDesigns() {
  const { data, isPending } = useDesignList(PENDING_PAGE);
  if (isPending) return <p className="text-ink-secondary text-sm">Đang tải…</p>;
  if (!data?.items.length) {
    return <p className="text-ink-secondary text-sm">Không có thiết kế nào chờ duyệt</p>;
  }
  return (
    <ul className="flex flex-col gap-3">
      {data.items.map((design) => (
        <li key={design.id} className="border-border-default flex flex-col gap-2 border-b pb-3">
          <p className="text-ink-primary text-sm font-medium">{design.name}</p>
          <ReviewActions designId={design.id} />
        </li>
      ))}
    </ul>
  );
}

/** "Xoá dữ liệu mock" asks first, then reseeds the mock and re-reads every design query. */
function ResetData() {
  const client = useQueryClient();
  const [asking, setAsking] = useState(false);
  const reset = useMutation({
    mutationFn: resetMockData,
    onSuccess: () => setAsking(false),
    onSettled: () => client.invalidateQueries({ queryKey: designKeys.all }),
  });
  if (!asking) {
    return (
      <Button variant="outline" className="min-h-11" onClick={() => setAsking(true)}>
        Xoá dữ liệu mock
      </Button>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="text-ink-primary text-sm">
        Xoá toàn bộ thiết kế giả lập và nạp lại dữ liệu mẫu?
      </p>
      <div className="flex gap-2">
        <Button
          variant="destructive"
          className="min-h-11 flex-1"
          disabled={reset.isPending}
          onClick={() => reset.mutate()}
        >
          Xoá hết
        </Button>
        <Button variant="outline" className="min-h-11 flex-1" onClick={() => setAsking(false)}>
          Huỷ
        </Button>
      </div>
    </div>
  );
}

/**
 * Where the trigger floats in the studio (layout A), whose bottom corners are taken: the stage's
 * zoom bar at the left, a draft's 3D card (or its pill) at the right. On a draft it sits left of
 * the card, over the empty middle of the zoom bar's row (`right-88`: the card's 300 px, its 12 px
 * inset and the area's own 12 px, then 28 px of room); a read-only design has no card, and its
 * bottom-right corner is the end of the preview's colour note, past its text.
 */
const studioPlace = (draft: boolean) => (draft ? "right-88" : "right-4");

/**
 * A floating stand-in for the Sales Manager on the mock (spec 2026-11-09 §6.5): in the studio it
 * acts on the open design, on /design on the designs waiting for review, on /design/new it only
 * resets. Compact, at the bottom left of a page; in the studio (`placement="studio"`) clear of the
 * stage's zoom bar and the 3D card (`studioPlace`). Like the design screens it acts for the
 * signed-in customer only: a visitor neither sees it nor makes it read.
 */
export function MockReviewPanel({
  designId,
  placement = "page",
}: {
  designId?: string;
  /** "page": the bottom-left corner; "studio": clear of the studio's bottom corners. */
  placement?: "page" | "studio";
}) {
  const isMock = useIsMock();
  const signedIn = useSignedIn();
  const pathname = usePathname();
  const params = useParams<{ id?: string }>();
  const shown = (isMock || DESIGN_API_MOCKED) && signedIn === true;
  const storage = useQuery({
    queryKey: ["design-mock", "storage"],
    queryFn: ({ signal }) => getMockStorage(signal),
    enabled: shown,
    staleTime: Infinity,
  });
  const openId = designId ?? params?.id;
  const launcher = pathname?.endsWith("/design/new") ?? false;
  // The open design as the studio already holds it: read from its cache, not fetched for this.
  const open = useQuery({
    ...designQuery(openId ?? ""),
    enabled: shown && placement === "studio" && openId !== undefined && !launcher,
  });
  if (!shown) return null;
  const studio = placement === "studio";

  return (
    <div
      className={cn(
        "fixed bottom-4 z-50",
        studio ? studioPlace(open.data?.status === "DRAFT") : "left-4",
      )}
    >
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="secondary"
            aria-label="Giả lập Quản lý kinh doanh"
            title="Giả lập Quản lý kinh doanh"
            className="min-h-11 rounded-full shadow-[var(--sh-md)]"
          >
            <UserCheck aria-hidden className="size-4" />
            Giả lập
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align={studio ? "end" : "start"}
          side="top"
          className="bg-bg-surface text-ink-primary border-border-default max-h-[70dvh] w-80 gap-3 overflow-y-auto p-[var(--card-pad)]"
        >
          {launcher ? null : openId ? <OpenDesignReview id={openId} /> : <PendingDesigns />}
          <ResetData />
          {storage.data?.persistent === false ? (
            <p className="text-ink-tertiary text-xs">Dữ liệu giả lập sẽ mất khi tải lại trang.</p>
          ) : null}
        </PopoverContent>
      </Popover>
    </div>
  );
}
