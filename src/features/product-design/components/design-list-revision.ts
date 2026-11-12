"use client";

import { useRouter } from "next/navigation";

import { STORE_ROUTES } from "@/constants";

import { useCreateRevision } from "../mutations";
import type { Design } from "../types";

/** "Tạo bản sửa" on the list, as the cards and the page need it. */
export type DesignRevision = {
  revise: (design: Design) => void;
  /** The design whose revision is being made or opened; undefined when none is. */
  revisingId: string | undefined;
  /** Every "Tạo bản sửa" waits: a second click would make a second draft. */
  busy: boolean;
  /** Why the last revision failed; null when it did not. */
  error: Error | null;
  /** Puts away the failure's message (dismissed, or the customer did something else). */
  clearError: () => void;
};

/**
 * "Tạo bản sửa" (spec §6.3): makes the revision of an APPROVED design and opens its draft. The
 * buttons stay off from the click until the studio opens: a made revision is never reset here, the
 * list goes away when the studio opens. A failure turns them back on and says why.
 */
export function useDesignRevision(): DesignRevision {
  const router = useRouter();
  const revision = useCreateRevision();
  const busy = revision.isPending || revision.isSuccess;
  return {
    revise: (design) =>
      revision.mutate(design.id, {
        onSuccess: (next) => router.push(STORE_ROUTES.design.detail(next.id)),
      }),
    revisingId: busy ? revision.variables : undefined,
    busy,
    error: revision.error,
    clearError: () => {
      if (revision.isError) revision.reset();
    },
  };
}
