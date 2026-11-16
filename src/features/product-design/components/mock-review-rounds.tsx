"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { formatDateTime } from "@/lib/format";

import { describeDesignError } from "../errors";
import { DESIGN_STATUS_META } from "../lifecycle";
import {
  MOCK_ROUNDS_KEY,
  listMockRounds,
  setApprovalFailure,
  simulateApproveRound,
  type MockRound,
  type MockRoundReview,
} from "../simulation";
import { reReadRound } from "../round-mutations";
import type { DesignStatus } from "../types";
import { ReviewActions } from "./mock-review-actions";

/** What "Duyệt tất cả" did, kept by name: the round may be closed (and gone) by the next read. */
type RoundResult = {
  roundId: string;
  projectName: string;
  approved: string[];
  failed: Array<{ designId: string; name: string; reason: string }>;
  closed: boolean;
};

function resultOf(round: MockRound, review: MockRoundReview): RoundResult {
  const nameOf = (id: string) => round.designs.find((design) => design.id === id)?.name ?? id;
  return {
    roundId: round.id,
    projectName: round.projectName,
    approved: review.approved.map(nameOf),
    failed: review.failed.map(({ designId, reason }) => ({
      designId,
      name: nameOf(designId),
      reason,
    })),
    closed: review.closed,
  };
}

/** "Lần duyệt kế tiếp sẽ lỗi" of one design (Q5): its next approval fails once, then clears. */
function FailSwitch({ designId, name, on }: { designId: string; name: string; on: boolean }) {
  const client = useQueryClient();
  const toggle = useMutation({
    mutationFn: (enabled: boolean) => setApprovalFailure(designId, enabled),
    onSettled: () => client.invalidateQueries({ queryKey: MOCK_ROUNDS_KEY }),
  });
  return (
    <div className="flex flex-col">
      <label className="text-ink-secondary flex min-h-11 items-center gap-2 text-xs">
        <Switch
          aria-label={`Lần duyệt kế tiếp sẽ lỗi: ${name}`}
          checked={on}
          disabled={toggle.isPending}
          onCheckedChange={(enabled) => toggle.mutate(enabled)}
        />
        Lần duyệt kế tiếp sẽ lỗi
      </label>
      {toggle.isError ? (
        <p role="alert" className="text-danger text-xs">
          Không đổi được công tắc giả lập.
        </p>
      ) : null}
    </div>
  );
}

function RoundDesign({ design }: { design: MockRound["designs"][number] }) {
  const meta = DESIGN_STATUS_META[design.status as DesignStatus];
  return (
    <li className="border-border-default flex flex-col gap-2 border-t pt-3">
      <p className="flex items-baseline justify-between gap-2 text-sm">
        <span className="text-ink-primary font-medium">{design.name}</span>
        <span className="text-ink-tertiary text-xs">{meta?.label ?? design.status}</span>
      </p>
      {design.waiting ? (
        <>
          <ReviewActions designId={design.id} name={design.name} />
          <FailSwitch designId={design.id} name={design.name} on={design.failNext} />
        </>
      ) : null}
    </li>
  );
}

function OpenRound({ round, onResult }: { round: MockRound; onResult: (r: RoundResult) => void }) {
  const client = useQueryClient();
  const approveAll = useMutation({
    mutationFn: () => simulateApproveRound(round.id),
    onSuccess: (review) => onResult(resultOf(round, review)),
    // Every design of the round may have changed, and with them the project's banner and cards:
    // re-read once for the round, not once per design.
    onSettled: () =>
      Promise.all([
        reReadRound(
          client,
          round.designs.map((design) => design.id),
        ),
        client.invalidateQueries({ queryKey: MOCK_ROUNDS_KEY }),
      ]),
  });
  return (
    <section aria-label={`Lượt duyệt ${round.projectName}`} className="flex flex-col gap-3">
      <div>
        <p className="text-ink-primary text-sm font-semibold">{round.projectName}</p>
        <p className="text-ink-tertiary text-xs">Mở lúc {formatDateTime(round.openedAt)}</p>
      </div>
      <ul className="flex flex-col gap-3">
        {round.designs.map((design) => (
          <RoundDesign key={design.id} design={design} />
        ))}
      </ul>
      {approveAll.error ? (
        <p role="alert" className="text-danger text-xs">
          {describeDesignError(approveAll.error)}
        </p>
      ) : null}
      <Button
        type="button"
        className="min-h-11"
        disabled={approveAll.isPending}
        onClick={() => approveAll.mutate()}
      >
        Duyệt tất cả
      </Button>
    </section>
  );
}

function ResultSummary({ result }: { result: RoundResult }) {
  return (
    <div
      role="group"
      aria-label={`Kết quả duyệt tất cả ${result.projectName}`}
      className="bg-bg-subtle flex flex-col gap-1 rounded-[var(--r-lg)] p-3 text-xs"
    >
      <p className="text-ink-primary font-medium">
        {result.projectName}: đã duyệt {result.approved.length} bản
        {result.failed.length ? `, ${result.failed.length} bản lỗi` : ""}
      </p>
      {result.approved.length ? (
        <p className="text-ink-secondary">Đã duyệt: {result.approved.join(", ")}</p>
      ) : null}
      {result.failed.map(({ designId, name, reason }) => (
        <p key={designId} className="text-danger">
          {name}: {reason}
        </p>
      ))}
      <p className="text-ink-tertiary">
        {result.closed ? "Lượt duyệt đã đóng." : "Lượt duyệt vẫn mở."}
      </p>
    </div>
  );
}

/** "Lượt duyệt dự án": the review rounds still open, to decide design by design or all at once. */
export function ReviewRounds() {
  const rounds = useQuery({
    queryKey: MOCK_ROUNDS_KEY,
    queryFn: ({ signal }) => listMockRounds(signal),
    // A round may have opened since the last read (the project page's own send): always ask again.
    staleTime: 0,
  });
  const [results, setResults] = useState<RoundResult[]>([]);
  const remember = (result: RoundResult) =>
    setResults((all) => [result, ...all.filter((one) => one.roundId !== result.roundId)]);
  // Unreadable (an older mock, no routes): the section is left out rather than shown broken.
  if (rounds.isError) return null;

  return (
    <section aria-label="Lượt duyệt dự án" className="flex flex-col gap-3">
      <h2 className="text-ink-primary text-sm font-semibold">Lượt duyệt dự án</h2>
      {rounds.isPending ? <p className="text-ink-secondary text-sm">Đang tải…</p> : null}
      {rounds.data && !rounds.data.length ? (
        <p className="text-ink-secondary text-sm">Không có lượt duyệt nào đang mở</p>
      ) : null}
      {rounds.data?.map((round) => (
        <OpenRound key={round.id} round={round} onResult={remember} />
      ))}
      {/* Mounted from the start, so a screen reader announces what is put into it. */}
      <div role="status" aria-label="Kết quả duyệt tất cả" className="flex flex-col gap-3">
        {results.map((result) => (
          <ResultSummary key={result.roundId} result={result} />
        ))}
      </div>
    </section>
  );
}
