"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, LockKeyhole, ShoppingBag } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CanvasToolbar } from "@/components/storefront/canvas-toolbar";
import { DesignCanvas } from "@/components/storefront/design-canvas";
import { PreflightReport } from "@/components/storefront/preflight-report";
import { useMyPermissions } from "@/lib/auth/my-permissions";

import {
  allowedActions,
  computeDesignStats,
  hasPreflightFail,
  useConfirmDesign,
  useSubmitDesign,
} from "..";
import { ElementPanel } from "./element-panel";
import { VariantRecheck } from "./variant-recheck";

import type { DesignDto } from "..";

interface DesignEditorProps {
  design: DesignDto;
}

export function DesignEditor({ design }: DesignEditorProps) {
  const [variantChanged, setVariantChanged] = useState(false);
  const submit = useSubmitDesign();
  const confirm = useConfirmDesign();
  const stats = useMemo(() => computeDesignStats(design), [design]);
  const { data: myPermissions } = useMyPermissions();
  const actions = allowedActions(design.status, myPermissions?.permissions);
  const canSubmit = actions.includes("submit") && stats.isReady;
  const canConfirm = actions.includes("confirm") && !hasPreflightFail(design);
  const canAddToCart = design.status === "Confirmed";

  return (
    <div className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(22.5rem,0.65fr)] lg:px-8 lg:py-6">
      <div className="min-w-0 space-y-4">
        <section className="bg-bg-surface border-border-default rounded-[var(--r-lg)] border p-[var(--card-pad)] shadow-[var(--card-shadow)]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <Badge className="bg-accent/10 text-accent hover:bg-accent/10 rounded-full">
                {design.productName}
              </Badge>
              <h1 className="font-display text-ink-primary mt-3 text-2xl font-bold sm:text-3xl">
                {design.name}
              </h1>
              <p className="text-ink-secondary mt-2 text-sm">
                {design.variantName} · v{design.version} · {design.status}
              </p>
            </div>
            <Badge variant="secondary" className="rounded-full">
              Preflight {design.preflightResult}
            </Badge>
          </div>
        </section>

        <VariantRecheck changed={variantChanged} variantName={design.variantName} />

        <section className="bg-bg-surface border-border-default space-y-3 rounded-[var(--r-lg)] border p-[var(--card-pad)] shadow-[var(--card-shadow)]">
          <CanvasToolbar zoom={100} onReset={() => setVariantChanged(false)} />
          <DesignCanvas elements={design.elements} zoom={100} />
          <p className="bg-bg-subtle text-ink-tertiary rounded-[var(--r-md)] p-3 text-xs">
            Preview 2D minh hoạ. Màu sắc hiển thị có thể sai lệch so với thành phẩm in thật.
          </p>
        </section>
      </div>

      <aside className="min-w-0 space-y-4 lg:sticky lg:top-[var(--sticky-top)] lg:self-start">
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Elements" value={stats.elementCount} />
          <Stat label="Warnings" value={stats.warningCount} />
          <Stat label="Fails" value={stats.failCount} />
          <Stat label="Outside" value={stats.outsideCount} />
        </div>
        <PreflightReport issues={design.preflightIssues} />
        <ElementPanel elements={design.elements} />
        <section className="bg-bg-surface border-border-default space-y-4 rounded-[var(--r-lg)] border p-[var(--card-pad)] shadow-[var(--card-shadow)]">
          <div>
            <h2 className="font-display text-ink-primary text-lg font-bold">Hành động thiết kế</h2>
            <p className="text-ink-secondary mt-1 text-sm">
              Fail sẽ chặn Confirm. Warning cần khách xác nhận rủi ro trước khi sản xuất.
            </p>
          </div>
          <div className="grid gap-2">
            <Button
              type="button"
              variant="secondary"
              className="min-h-11 rounded-[var(--r-md)]"
              onClick={() => setVariantChanged(true)}
            >
              Đổi biến thể
            </Button>
            <Button
              type="button"
              className="min-h-11 rounded-[var(--r-md)]"
              disabled={!canSubmit || submit.isPending}
              onClick={() => submit.mutate(design.id)}
            >
              Submit preflight
            </Button>
            <Button
              type="button"
              className="min-h-11 rounded-[var(--r-md)]"
              disabled={!canConfirm || confirm.isPending}
              onClick={() =>
                confirm.mutate({
                  id: design.id,
                  preflightResult: design.preflightResult,
                  acceptedWarnings: true,
                })
              }
            >
              Confirm snapshot
            </Button>
            <Button
              type="button"
              variant={canAddToCart ? "default" : "secondary"}
              className="min-h-11 rounded-[var(--r-md)]"
              disabled={!canAddToCart}
            >
              {canAddToCart ? (
                <ShoppingBag className="h-4 w-4" />
              ) : (
                <LockKeyhole className="h-4 w-4" />
              )}
              Thêm vào giỏ
            </Button>
          </div>
          {!canConfirm && (
            <div className="bg-bg-subtle text-ink-secondary flex gap-3 rounded-[var(--r-md)] p-3 text-sm">
              <AlertTriangle className="text-warning h-5 w-5 shrink-0" />
              <p>Sửa các lỗi preflight hoặc kiểm tra lại biến thể trước khi xác nhận.</p>
            </div>
          )}
        </section>
      </aside>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-bg-surface border-border-default rounded-[var(--r-lg)] border p-3 shadow-[var(--card-shadow)]">
      <p className="text-ink-secondary text-xs">{label}</p>
      <p className="font-display text-ink-primary text-xl font-bold tabular-nums">{value}</p>
    </div>
  );
}
