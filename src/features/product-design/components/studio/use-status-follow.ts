"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { invalidateDesign } from "../../mutations";
import type { Design, DesignStatus } from "../../types";

export type StatusFollow = {
  /**
   * The next move to `status` is this tab's own write, which re-reads what goes with it (a
   * submission): it is not read again.
   */
  ownMove(status: DesignStatus): void;
};

/**
 * The design moved to another status while it is open (the review answered, another tab submitted
 * it): its history, files, the lists and the draft count are re-read with it — once: a move this
 * tab's own write announced (`ownMove`) was re-read by that write.
 */
export function useStatusFollow(design: Pick<Design, "id" | "status">): StatusFollow {
  const client = useQueryClient();
  const shown = useRef(design.status);
  const own = useRef<DesignStatus | null>(null);
  useEffect(() => {
    if (shown.current === design.status) return;
    shown.current = design.status;
    const announced = own.current === design.status;
    own.current = null;
    if (announced) return;
    invalidateDesign(client, design.id).catch(() => undefined); // best effort: the next read retries
  }, [client, design.id, design.status]);
  const [follow] = useState<StatusFollow>(() => ({
    ownMove: (status) => {
      // Already shown (a poll got there first): nothing will move, nothing to let go.
      own.current = shown.current === status ? null : status;
    },
  }));
  return follow;
}
