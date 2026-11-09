"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UserCheck } from "lucide-react";
import { useParams, usePathname } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useSignedIn } from "@/lib/auth/use-signed-in";
import { DESIGN_API_MOCKED } from "@/lib/config";
import { useIsMock } from "@/providers/app-providers";

import { designKeys, useDesign, useDesignList } from "../queries";
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
 * A floating stand-in for the Sales Manager on the mock (spec 2026-11-09 §6.5): in the studio it
 * acts on the open design, on /design on the designs waiting for review, on /design/new it only
 * resets. Bottom-left and compact, so it stays clear of the studio's controls. Like the design
 * screens it acts for the signed-in customer only: a visitor neither sees it nor makes it read.
 */
export function MockReviewPanel({ designId }: { designId?: string }) {
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
  if (!shown) return null;

  const openId = designId ?? params?.id;
  const launcher = pathname?.endsWith("/design/new") ?? false;

  return (
    <div className="fixed bottom-4 left-4 z-50">
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="secondary" className="min-h-11 rounded-full shadow-[var(--sh-md)]">
            <UserCheck aria-hidden className="size-4" />
            Giả lập Quản lý kinh doanh
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
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
