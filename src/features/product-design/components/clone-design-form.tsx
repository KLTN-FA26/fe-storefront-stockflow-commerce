"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";

import { STORE_ROUTES } from "@/constants";
import { Alert } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import { retargetDocument } from "../engine/document/retarget";
import { describeDesignError } from "../errors";
import { useCloneDesign } from "../mutations";
import { designDocumentQuery } from "../queries";
import { isRetryableWithSameKey } from "../create-key";
import { templateOf } from "../selectors";
import type { CloneResult, Design } from "../types";
import { TargetChoice, TargetsLoading } from "./clone-design-parts";
import { CloneOutcome } from "./clone-design-outcome";
import { useCloneTargets, type ProductSkusLoader } from "./clone-design-targets";
import { RetryButton } from "./design-list-states";

type Made = { result: CloneResult; dropped: number };

/** The body of the dialog: choose a variant, re-fit, copy, then open the studio of the copy. */
export function CloneForm({
  design,
  skusOf,
  busy,
  onBusyChange,
  onCancel,
}: {
  design: Design;
  skusOf: ProductSkusLoader | undefined;
  busy: boolean;
  onBusyChange: (busy: boolean) => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const client = useQueryClient();
  const loaded = useCloneTargets(design, skusOf);
  const clone = useCloneDesign(design.id);
  const [picked, setPicked] = useState<string | null>(null);
  // The only variant to copy to is chosen for the customer (R6).
  const sku =
    picked ??
    (loaded.status === "ready" && loaded.targets.length === 1 ? loaded.targets[0]!.sku : null);
  const [made, setMade] = useState<Made | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  // One key per variant chosen: a retry after a lost answer is the same request (R-E7). A refusal
  // the BE stores for the key (a 4xx) drops it: the same key would replay that answer for ever.
  const attempt = useRef<{ sku: string; key: string } | null>(null);
  const open = (id: string) => router.push(STORE_ROUTES.design.detail(id));

  function pick(next: string) {
    setPicked(next);
    setFailure(null);
  }

  async function confirm() {
    if (loaded.status !== "ready") return;
    const target = loaded.targets.find((t) => t.sku === sku);
    if (!target) return;
    if (attempt.current?.sku !== target.sku) {
      attempt.current = { sku: target.sku, key: crypto.randomUUID() };
    }
    const { key } = attempt.current;
    setFailure(null);
    onBusyChange(true);
    try {
      // What is stored now, not a copy up to a minute old: another tab may have saved since.
      const record = await client.fetchQuery({ ...designDocumentQuery(design.id), staleTime: 0 });
      const fitted = retargetDocument(
        record.document,
        templateOf(loaded.source.config),
        templateOf(target.config),
      );
      const result = await clone.mutateAsync({
        variantSku: target.sku,
        document: fitted.document,
        idempotencyKey: key,
      });
      // Nothing to tell: straight to the studio, the dialog stays locked until it opens.
      // Otherwise the customer reads the report first.
      if (fitted.dropped === 0 && result.notInProject === null) open(result.design.id);
      else {
        setMade({ result, dropped: fitted.dropped });
        onBusyChange(false);
      }
    } catch (error) {
      if (!isRetryableWithSameKey(error)) attempt.current = null;
      setFailure(error);
      onBusyChange(false);
    }
  }

  if (made) return <CloneOutcome {...made} onOpen={() => open(made.result.design.id)} />;
  const ready = loaded.status === "ready";
  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-ink-primary text-lg font-semibold">
          Nhân bản sang quy cách khác
        </DialogTitle>
        <DialogDescription className="text-ink-secondary text-sm">
          Tạo một bản nháp mới của “{design.name}” cho quy cách khác của cùng sản phẩm. Bố cục được
          co giãn theo quy cách mới; bạn xem lại trong studio.
        </DialogDescription>
      </DialogHeader>

      {loaded.status === "loading" ? <TargetsLoading /> : null}
      {loaded.status === "unavailable" ? (
        <Alert tone="warning">Chưa thể nhân bản thiết kế này sang quy cách khác.</Alert>
      ) : null}
      {loaded.status === "error" ? (
        <div className="space-y-2">
          <Alert tone="danger" title="Không tải được các quy cách">
            {describeDesignError(loaded.error)}
          </Alert>
          <RetryButton onRetry={loaded.retry} retrying={loaded.retrying} />
        </div>
      ) : null}
      {ready && loaded.targets.length === 0 ? (
        <Alert tone="info">Sản phẩm này chưa có quy cách khác nhận thiết kế.</Alert>
      ) : null}
      {ready && loaded.targets.length > 0 ? (
        <TargetChoice
          targets={loaded.targets}
          productTitle={design.product.title}
          value={sku}
          onChange={pick}
        />
      ) : null}

      {failure ? (
        <div className="space-y-2">
          <Alert tone="danger" title="Chưa nhân bản được">
            {describeDesignError(failure)}
          </Alert>
          <RetryButton onRetry={() => void confirm()} retrying={busy} />
        </div>
      ) : null}

      <DialogFooter className="gap-2">
        <Button
          type="button"
          variant="outline"
          className="min-h-11 rounded-[var(--r-md)] px-5"
          disabled={busy}
          onClick={onCancel}
        >
          Huỷ
        </Button>
        <Button
          type="button"
          className="min-h-11 rounded-[var(--r-md)] px-5"
          disabled={sku === null || !ready || busy}
          onClick={() => void confirm()}
        >
          {busy ? "Đang nhân bản…" : "Nhân bản"}
        </Button>
      </DialogFooter>
      {ready && loaded.targets.length > 0 && sku === null ? (
        <p role="status" className="text-ink-secondary -mt-2 text-right text-sm">
          Chọn quy cách mới để tiếp tục
        </p>
      ) : null}
    </>
  );
}
