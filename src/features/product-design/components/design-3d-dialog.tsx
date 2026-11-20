"use client";

import { useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import { useEffect, useEffectEvent, useRef, useState } from "react";

import { Alert, Skeleton } from "@/components/shared";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { describeDesignError } from "../errors";
import { COLOR_DISCLAIMER } from "./color-disclaimer";
import type { FontRegistry } from "../engine";
import type { Design } from "../types";

type Picture =
  { state: "loading" } | { state: "failed"; error: unknown } | { state: "ready"; url: string };

/**
 * Draws the design on its model once the dialog is open: the fonts and the renderer (three.js) are
 * imported now, not with the page (several 3D views at once would be too heavy for a phone, so
 * the project page shows none until asked).
 */
function Design3DBody({
  design,
  loadFonts,
}: {
  design: Design;
  loadFonts: () => Promise<FontRegistry>;
}) {
  const client = useQueryClient();
  const [attempt, setAttempt] = useState(0);
  const [picture, setPicture] = useState<Picture>({ state: "loading" });
  const load = useEffectEvent(loadFonts);
  // One session at a time: a retry (or a second effect run) starts after the last one let go.
  const last = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    const abort = new AbortController();
    let url: string | null = null;
    const run = async () => {
      await last.current;
      if (abort.signal.aborted) return;
      try {
        const [fonts, { renderDesign3D }] = await Promise.all([
          load(),
          import("./design-3d-render"),
        ]);
        const png = await renderDesign3D(client, design.id, fonts, abort.signal);
        if (abort.signal.aborted) return;
        url = URL.createObjectURL(new Blob([new Uint8Array(png)], { type: "image/png" }));
        setPicture({ state: "ready", url });
      } catch (error) {
        if (!abort.signal.aborted) setPicture({ state: "failed", error });
      }
    };
    last.current = run();
    return () => {
      abort.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [client, design.id, attempt]);

  return (
    <div className="space-y-3">
      <div className="bg-bg-subtle relative aspect-square w-full overflow-hidden rounded-[var(--r-lg)]">
        {picture.state === "ready" ? (
          <Image
            src={picture.url}
            alt={`Bản xem trước 3D ${design.name}`}
            fill
            unoptimized
            sizes="(min-width: 640px) 32rem, 100vw"
            className="object-contain"
          />
        ) : picture.state === "loading" ? (
          <div role="status" aria-label="Đang dựng bản xem trước 3D" className="size-full">
            <Skeleton className="size-full" />
          </div>
        ) : null}
      </div>
      {picture.state === "failed" ? (
        <div className="space-y-3">
          <Alert tone="danger" title="Không dựng được bản xem trước 3D">
            {describeDesignError(picture.error)}
          </Alert>
          <Button
            type="button"
            variant="outline"
            className="min-h-11 rounded-[var(--r-md)] px-4"
            onClick={() => {
              setPicture({ state: "loading" });
              setAttempt((n) => n + 1);
            }}
          >
            Thử lại
          </Button>
        </div>
      ) : null}
      <p className="text-ink-tertiary text-xs">{COLOR_DISCLAIMER}</p>
    </div>
  );
}

/** "Xem 3D" (spec 2026-11-12 §5): one design on its model, loaded only while this is open. */
export function Design3DDialog({
  design,
  onClose,
  loadFonts,
}: {
  /** The design to show; `null` keeps the dialog closed and loads nothing. */
  design: Design | null;
  onClose: () => void;
  loadFonts: () => Promise<FontRegistry>;
}) {
  return (
    <Dialog open={design !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="bg-bg-surface border-border-default max-h-[90dvh] gap-4 overflow-y-auto rounded-[var(--r-xl)] border p-[var(--card-pad)] shadow-[var(--sh-lg)] ring-0 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-ink-primary text-lg font-semibold">
            {design ? `Xem 3D · ${design.name}` : "Xem 3D"}
          </DialogTitle>
          <DialogDescription className="text-ink-secondary text-sm">
            Bản thiết kế đã lưu trên mô hình sản phẩm.
          </DialogDescription>
        </DialogHeader>
        {design ? <Design3DBody key={design.id} design={design} loadFonts={loadFonts} /> : null}
      </DialogContent>
    </Dialog>
  );
}
