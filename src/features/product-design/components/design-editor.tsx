"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, LockKeyhole, ShoppingBag } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CanvasToolbar } from "@/components/storefront/canvas-toolbar";
import { DesignCanvas } from "@/components/storefront/design-canvas";
import { PreflightReport } from "@/components/storefront/preflight-report";

import { allowedActions, computeDesignStats, hasPreflightFail, useConfirmDesign, useSubmitDesign } from "..";
import { ElementPanel } from "./element-panel";
import { VariantRecheck } from "./variant-recheck";

import type { DesignDto, DesignRole } from "..";

interface DesignEditorProps {
  design: DesignDto;
  role?: DesignRole;
}

export function DesignEditor({ design, role = "Customer" }: DesignEditorProps) {
  const [variantChanged, setVariantChanged] = useState(false);
  const submit = useSubmitDesign();
  const confirm = useConfirmDesign();
  const stats = useMemo(() => computeDesignStats(design), [design]);
  const actions = allowedActions(design.status, role);
  const canSubmit = actions.includes("submit") && stats.isReady;
  const canConfirm = actions.includes("confirm") && !hasPreflightFail(design);
  const canAddToCart = design.status === "Confirmed";

  return (
    <div className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)] lg:px-8">
      <div className="space-y-5">
        <section className="rounded-[var(--r-xl)] bg-bg-surface p-[var(--card-pad)] shadow-md">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <Badge className="rounded-full bg-accent/10 text-accent hover:bg-accent/10">{design.productName}</Badge>
              <h1 className="mt-4 font-display text-4xl font-bold">{design.name}</h1>
              <p className="mt-2 text-sm text-ink-secondary">{design.variantName} · v{design.version} · {design.status}</p>
            </div>
            <Badge variant="secondary" className="rounded-full">Preflight {design.preflightResult}</Badge>
          </div>
        </section>

        <VariantRecheck changed={variantChanged} variantName={design.variantName} />

        <section className="space-y-4 rounded-[var(--r-xl)] bg-bg-surface p-4 shadow-md">
          <CanvasToolbar zoom={100} onReset={() => setVariantChanged(false)} />
          <DesignCanvas elements={design.elements} zoom={100} />
          <p className="rounded-[var(--r-lg)] bg-bg-subtle p-3 text-xs text-ink-tertiary">Preview 2D minh hoạ. Màu sắc hiển thị có thể sai lệch so với thành phẩm in thật.</p>
        </section>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Elements" value={stats.elementCount} />
          <Stat label="Warnings" value={stats.warningCount} />
          <Stat label="Fails" value={stats.failCount} />
          <Stat label="Outside" value={stats.outsideCount} />
        </div>
        <PreflightReport issues={design.preflightIssues} />
        <ElementPanel elements={design.elements} />
        <section className="space-y-4 rounded-[var(--r-xl)] bg-bg-surface p-[var(--card-pad)] shadow-md">
          <div>
            <h2 className="font-display text-xl font-bold">Hành động thiết kế</h2>
            <p className="mt-1 text-sm text-ink-secondary">Fail sẽ chặn Confirm. Warning cần khách xác nhận rủi ro trước khi sản xuất.</p>
          </div>
          <div className="grid gap-2">
            <Button type="button" variant="secondary" className="rounded-full" onClick={() => setVariantChanged(true)}>Đổi biến thể</Button>
            <Button type="button" className="rounded-full" disabled={!canSubmit || submit.isPending} onClick={() => submit.mutate(design.id)}>Submit preflight</Button>
            <Button type="button" className="rounded-full" disabled={!canConfirm || confirm.isPending} onClick={() => confirm.mutate({ id: design.id, preflightResult: design.preflightResult, acceptedWarnings: true })}>Confirm snapshot</Button>
            <Button type="button" variant={canAddToCart ? "default" : "secondary"} className="rounded-full" disabled={!canAddToCart}>
              {canAddToCart ? <ShoppingBag className="h-4 w-4" /> : <LockKeyhole className="h-4 w-4" />}
              Thêm vào giỏ
            </Button>
          </div>
          {!canConfirm && (
            <div className="flex gap-3 rounded-[var(--r-lg)] bg-bg-subtle p-3 text-sm text-ink-secondary">
              <AlertTriangle className="h-5 w-5 shrink-0 text-warning" />
              <p>Sửa các lỗi preflight hoặc kiểm tra lại biến thể trước khi xác nhận.</p>
            </div>
          )}
        </section>
      </aside>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return <div className="rounded-[var(--r-lg)] bg-bg-surface p-4 shadow-md"><p className="text-xs text-ink-secondary">{label}</p><p className="font-display text-2xl font-bold tabular-nums">{value}</p></div>;
}
