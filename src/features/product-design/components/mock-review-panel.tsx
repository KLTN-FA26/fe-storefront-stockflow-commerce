"use client";

import { useQuery } from "@tanstack/react-query";
import { UserCheck } from "lucide-react";
import { useParams, usePathname } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useSignedIn } from "@/lib/auth/use-signed-in";
import { cn } from "@/lib/cn";
import { DESIGN_API_MOCKED } from "@/lib/config";
// Read from the providers: the full-mock switch lives there, and this is its only use in the feature.
import { useIsMock } from "@/providers/app-providers";

import { designQuery } from "../queries";
import { getMockStorage } from "../simulation";
import { OpenDesignReview, PendingDesigns, ResetData } from "./mock-review-parts";
import { ReviewRounds } from "./mock-review-rounds";

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
 * resets; on a project page it lists the open review rounds. Compact, at the bottom left of a
 * page; in the studio (`placement="studio"`) clear of the stage's zoom bar and the 3D card
 * (`studioPlace`). Like the design screens it acts for the signed-in customer only: a visitor
 * neither sees it nor makes it read.
 */
export function MockReviewPanel({
  designId,
  placement = "page",
  liftForBar = false,
}: {
  designId?: string;
  /** "page": the bottom-left corner; "studio": clear of the studio's bottom corners. */
  placement?: "page" | "studio";
  /**
   * A sticky bar sits at the bottom of the page (the project page's selection bar). Its height is
   * not known (the reason and the phone note wrap), so on a phone the trigger moves to the top
   * instead of being lifted by a guess; from `lg` it rises above the bar.
   */
  liftForBar?: boolean;
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
  // On /design/projects/[id] (and its /submit step) the route's id is a PROJECT id, not a design's:
  // the open-design part is left out there, the rounds stand in for it.
  const projects = pathname?.startsWith("/design/projects") ?? false;
  // The open design as the studio already holds it: read from its cache, not fetched for this.
  const open = useQuery({
    ...designQuery(openId ?? ""),
    enabled: shown && placement === "studio" && openId !== undefined && !launcher && !projects,
  });
  if (!shown) return null;
  const studio = placement === "studio";

  return (
    <div
      className={cn(
        "fixed z-50",
        liftForBar ? "top-[calc(var(--header-h)+0.75rem)] lg:top-auto lg:bottom-24" : "bottom-4",
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
          {launcher ? null : openId && !projects ? (
            <OpenDesignReview id={openId} />
          ) : (
            // On a project page the route's id is the project's, so a design sent on its own is
            // decided from this list, like on /design.
            <PendingDesigns />
          )}
          {launcher ? null : <ReviewRounds />}
          <ResetData />
          {storage.data?.persistent === false ? (
            <p className="text-ink-tertiary text-xs">Dữ liệu giả lập sẽ mất khi tải lại trang.</p>
          ) : null}
        </PopoverContent>
      </Popover>
    </div>
  );
}
