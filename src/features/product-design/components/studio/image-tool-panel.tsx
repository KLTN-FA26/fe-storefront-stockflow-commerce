"use client";

import { Upload } from "lucide-react";
import Image from "next/image";
import { useId, useState, type DragEvent } from "react";

import { Alert, Skeleton } from "@/components/shared";
import { cn } from "@/lib/cn";
import { isRemoteImage } from "@/lib/remote-image";

import { useDesignAssets, useDownloadLink } from "../../queries";
import type { DesignAsset } from "../../types";
import { placeImage } from "./image-actions";
import { useEditorState, useStudio } from "./studio-context";
import { acceptedFormats, firstFile, UPLOAD_MESSAGES, useAssetPicker } from "./use-asset-upload";
import { usePasteImage } from "./use-paste-image";

/** One stored image as a button that places it on the active surface. */
function AssetThumb({
  asset,
  designId,
  disabled,
  onPick,
}: {
  asset: DesignAsset;
  designId: string;
  disabled: boolean;
  onPick: (asset: DesignAsset) => void;
}) {
  const link = useDownloadLink("asset", designId, asset.assetId, true);
  const src = link.data?.url;
  return (
    <button
      type="button"
      aria-label={`Thêm ảnh ${asset.originalName}`}
      title={asset.originalName}
      disabled={disabled}
      onClick={() => onPick(asset)}
      className="bg-bg-subtle border-border-default hover:border-border-strong focus-visible:ring-accent relative aspect-square min-h-11 overflow-hidden rounded-[var(--r-md)] border outline-none focus-visible:ring-2 disabled:opacity-50"
    >
      {src ? (
        <Image
          src={src}
          alt=""
          fill
          unoptimized={isRemoteImage(src)}
          sizes="7rem"
          className="object-contain p-1.5"
        />
      ) : (
        <Skeleton className="absolute inset-0 rounded-none" />
      )}
    </button>
  );
}

/**
 * The Image/Logo tool's options: a dropzone ("Kéo thả hoặc chọn ảnh") that also takes a paste on
 * the stage, and the images already uploaded to this design. A picked, dropped or pasted file is
 * stored and placed on the active surface; picking an uploaded image places it again.
 */
export function ImageToolPanel() {
  const services = useStudio();
  const { design, template, capabilities, stageRef } = services;
  const readOnly = useEditorState((s) => s.readOnly);
  const assets = useDesignAssets(design.id, capabilities.assets);
  const { pick, busy, error, fail } = useAssetPicker();
  const [dragging, setDragging] = useState(false);
  const inputId = useId();
  const hintId = useId();

  const place = (asset: DesignAsset) => {
    if (!placeImage(services, asset)) fail(UPLOAD_MESSAGES.noRoom);
  };
  const addFile = async (file: File) => {
    const asset = await pick(file);
    if (asset) place(asset);
  };
  usePasteImage(stageRef, readOnly ? null : (file) => void addFile(file));

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    const file = firstFile(event.dataTransfer.files);
    if (file && !readOnly) void addFile(file);
  };

  return (
    <div className="flex flex-col gap-4">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          "border-border-strong relative flex min-h-32 flex-col items-center justify-center gap-1 rounded-[var(--r-lg)] border-2 border-dashed p-4 text-center focus-within:ring-2",
          "focus-within:ring-accent",
          dragging ? "bg-bg-muted border-accent" : "bg-bg-subtle",
        )}
      >
        <input
          id={inputId}
          type="file"
          accept={acceptedFormats(template)}
          disabled={readOnly || busy}
          aria-describedby={hintId}
          className="sr-only"
          onChange={(event) => {
            const file = firstFile(event.target.files);
            event.target.value = ""; // the same file can be picked again
            if (file) void addFile(file);
          }}
        />
        <Upload aria-hidden className="text-accent size-6" />
        <label
          htmlFor={inputId}
          className="text-ink-primary cursor-pointer text-sm font-medium after:absolute after:inset-0"
        >
          Kéo thả hoặc chọn ảnh
        </label>
        <p id={hintId} className="text-ink-tertiary text-xs">
          PNG, JPG, WebP hoặc SVG, tối đa {template.maxFileSizeMb} MB. Có thể dán ảnh (Ctrl+V) khi
          đang chọn khung vẽ.
        </p>
      </div>
      {busy ? (
        <p role="status" className="text-ink-secondary text-sm">
          Đang tải ảnh lên…
        </p>
      ) : null}
      {error ? (
        <div role="alert">
          <Alert tone="danger">{error}</Alert>
        </div>
      ) : null}
      <section aria-label="Ảnh đã tải lên" className="flex flex-col gap-2">
        <h3 className="text-ink-primary text-sm font-semibold">Ảnh đã tải lên</h3>
        {assets.data?.length ? (
          <div className="grid grid-cols-2 gap-2">
            {assets.data.map((asset) => (
              <AssetThumb
                key={asset.assetId}
                asset={asset}
                designId={design.id}
                disabled={readOnly || busy}
                onPick={place}
              />
            ))}
          </div>
        ) : (
          <p className="text-ink-tertiary text-sm">Chưa có ảnh nào được tải lên.</p>
        )}
      </section>
    </div>
  );
}
