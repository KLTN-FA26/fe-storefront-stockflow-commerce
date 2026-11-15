"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/ui/button";

import { designKeys, projectKeys, useDesign, useDesignList } from "../queries";
import { MOCK_ROUNDS_KEY, resetMockData } from "../simulation";
import { ReviewActions } from "./mock-review-actions";

const PENDING_PAGE = { status: "PENDING_REVIEW", page: 1, size: 10 } as const;

/** The open design: only a design waiting for review can be approved or returned. */
export function OpenDesignReview({ id }: { id: string }) {
  const { data: design } = useDesign(id);
  if (!design) return null;
  if (design.status !== "PENDING_REVIEW") {
    return <p className="text-ink-secondary text-sm">Thiết kế này không ở trạng thái chờ duyệt.</p>;
  }
  return <ReviewActions designId={id} />;
}

/** On /design: the caller's designs waiting for review, first page. */
export function PendingDesigns() {
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
          <ReviewActions designId={design.id} name={design.name} />
        </li>
      ))}
    </ul>
  );
}

/**
 * "Xoá dữ liệu mock" asks first, then reseeds the mock. The designs are re-read; the projects and
 * the open rounds are RESET, not just marked stale: the reseed empties them, and what a screen
 * holds of them must go, not stay on show until the next read.
 */
export function ResetData() {
  const client = useQueryClient();
  const [asking, setAsking] = useState(false);
  const reset = useMutation({
    mutationFn: resetMockData,
    onSuccess: () => setAsking(false),
    onSettled: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: designKeys.all }),
        client.resetQueries({ queryKey: projectKeys.all }),
        client.resetQueries({ queryKey: MOCK_ROUNDS_KEY }),
      ]),
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
