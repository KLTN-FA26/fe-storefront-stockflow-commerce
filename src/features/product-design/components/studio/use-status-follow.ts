"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { invalidateDesign } from "../../mutations";
import type { Design } from "../../types";

/**
 * The design moved to another status while it is open (the review answered, another tab submitted
 * it): its history, files, the lists and the draft count are re-read with it.
 */
export function useStatusFollow(design: Pick<Design, "id" | "status">) {
  const client = useQueryClient();
  const shown = useRef(design.status);
  useEffect(() => {
    if (shown.current === design.status) return;
    shown.current = design.status;
    invalidateDesign(client, design.id).catch(() => undefined); // best effort: the next read retries
  }, [client, design.id, design.status]);
}
