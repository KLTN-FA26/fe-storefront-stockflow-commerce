"use client";

import { ImageOff, Lock } from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";

import { Skeleton } from "@/components/shared";

import type { ExportRenderer } from "./export-renderer";
import { COLOR_DISCLAIMER } from "./viewer-host";

/** The confirmation's picture: small, drawn once the preflight passed. */
const CONFIRM_PREVIEW_PX = 480;

/** PNG bytes as a `data:` URL: nothing to revoke when the dialog goes. */
function pngDataUrl(bytes: Uint8Array) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return `data:image/png;base64,${btoa(binary)}`;
}

/**
 * The design as the customer is about to send it, drawn once the preflight passed (`enabled`):
 * `undefined` until it is drawn, `null` when it could not be.
 */
export function useConfirmPreview(renderer: ExportRenderer, enabled: boolean) {
  const [src, setSrc] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    renderer.preview(CONFIRM_PREVIEW_PX).then(
      (bytes) => live && setSrc(pngDataUrl(bytes)),
      () => live && setSrc(null),
    );
    return () => {
      live = false;
    };
  }, [renderer, enabled]);
  return src;
}

/**
 * A Pass, before anything is drawn or sent (spec §6.4): the preview, that the design is locked
 * until the review answers (docs 12 BR-07), and the print-colour notice.
 */
export function ConfirmBody({ src }: { src: string | null | undefined }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="bg-bg-subtle border-border-default relative mx-auto aspect-square w-full max-w-64 overflow-hidden rounded-[var(--r-lg)] border">
        {src ? (
          <Image
            src={src}
            alt="Ảnh xem trước thiết kế"
            width={CONFIRM_PREVIEW_PX}
            height={CONFIRM_PREVIEW_PX}
            unoptimized
            className="size-full object-contain"
          />
        ) : src === null ? (
          <span className="text-ink-tertiary absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm">
            <ImageOff aria-hidden className="size-6" />
            Chưa tạo được ảnh xem trước
          </span>
        ) : (
          <Skeleton className="absolute inset-0 rounded-none" />
        )}
      </div>
      <p className="text-ink-primary flex items-start gap-2 text-sm">
        <Lock aria-hidden className="mt-0.5 size-4 shrink-0" />
        Bản sẽ bị khoá đến khi có kết quả duyệt.
      </p>
      <p className="text-ink-tertiary text-xs">{COLOR_DISCLAIMER}</p>
    </div>
  );
}
