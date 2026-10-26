"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { deriveUiState, type DesignUiState } from "../../lifecycle";
import { useConfirmDesign, useFinalizeDesign } from "../../mutations";
import { designQuery } from "../../queries";
import { isStored } from "./use-autosave";
import { useWorkflow } from "./workflow-context";

/** `finalize`: "Chốt thiết kế" after QC passed it; `confirm`: "Xác nhận thiết kế" Sales sent. */
export type FinalizeMode = "finalize" | "confirm";

/**
 * The states the design may be in, once saved, for the step to go on. A finalize whose submit went
 * through and whose confirmation failed left the design SUBMITTED (`awaitingConfirmation`): its
 * retry only confirms (`useFinalizeDesign` skips the submit of a non-DRAFT target).
 */
const EXPECTED: Record<FinalizeMode, readonly DesignUiState[]> = {
  finalize: ["reviewPassed", "awaitingConfirmation"],
  confirm: ["awaitingConfirmation"],
};

const REFUSALS = {
  notSaved: "Thiết kế chưa lưu được nên chưa thể chốt. Hãy lưu lại rồi thử lại.",
  finalize: "Thay đổi vừa lưu đã huỷ kết quả kiểm tra. Hãy gửi QC kiểm tra lại trước khi chốt.",
  confirm: "Thiết kế vừa đổi trạng thái. Hãy xem lại trước khi xác nhận.",
} as const;

/**
 * Chốt / xác nhận with what is stored: a pending edit is saved first (a "Chốt" inside autosave's
 * 1.5 s wait would otherwise freeze the older document and lose the edit). A save that cannot be
 * made refuses; one that voided the review (the design is no longer in the expected state) stops
 * and says so. The write then goes out with the design as just read.
 */
export function useFinalize(mode: FinalizeMode) {
  const { design, autosave } = useWorkflow();
  const client = useQueryClient();
  const finalize = useFinalizeDesign(design.id);
  const confirm = useConfirmDesign(design.id);
  const mutation = mode === "finalize" ? finalize : confirm;
  const [preparing, setPreparing] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [readError, setReadError] = useState<unknown>(null);

  async function submit(onSuccess: () => void) {
    setRefusal(null);
    setReadError(null);
    setPreparing(true);
    try {
      await autosave.flush();
      if (!isStored(autosave.latestState())) return setRefusal(REFUSALS.notSaved);
      const fresh = await client.fetchQuery({ ...designQuery(design.id), staleTime: 0 });
      if (!EXPECTED[mode].includes(deriveUiState(fresh))) return setRefusal(REFUSALS[mode]);
      if (mode === "finalize") finalize.mutate(fresh, { onSuccess });
      else confirm.mutate(fresh, { onSuccess });
    } catch (error) {
      setReadError(error);
    } finally {
      setPreparing(false);
    }
  }

  return {
    submit,
    pending: preparing || mutation.isPending,
    refusal,
    error: readError ?? mutation.error,
  };
}
