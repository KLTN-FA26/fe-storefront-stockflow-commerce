import { Alert } from "@/components/shared";
import { formatDateTime } from "@/lib/format";

import type { Design, DesignProject } from "../types";

/**
 * How many designs of the round still wait: the round's ids whose design is still
 * `PENDING_REVIEW` (the round stays open until its last decision). Until the project's designs
 * are read, all of the round's ids.
 */
function waitingIn(
  round: NonNullable<DesignProject["openRound"]>,
  designs: readonly Design[] | undefined,
) {
  if (designs === undefined) return round.designIds.length;
  const pending = new Set(designs.filter((d) => d.status === "PENDING_REVIEW").map((d) => d.id));
  return round.designIds.filter((id) => pending.has(id)).length;
}

/**
 * The whole-set review under way (docs 12 BR-19, BR-20): its designs wait together, and none of
 * them can leave the project meanwhile.
 */
export function OpenRoundBanner({
  round,
  designs,
}: {
  round: DesignProject["openRound"];
  /** The project's designs, when read: they say which of the round's are decided already. */
  designs: readonly Design[] | undefined;
}) {
  if (round === null) return null;
  const since = Number.isNaN(Date.parse(round.openedAt)) ? null : formatDateTime(round.openedAt);
  return (
    <Alert tone="info" title="Đang chờ duyệt cả bộ">
      Lượt duyệt cả bộ{since ? ` gửi lúc ${since}` : ""}: còn {waitingIn(round, designs)} bản đang
      chờ.
    </Alert>
  );
}
