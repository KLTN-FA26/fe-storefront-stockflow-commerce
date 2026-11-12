"use client";

import Image from "next/image";

import { Alert, Skeleton } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { isRemoteImage } from "@/lib/remote-image";

import { useDesignAssets, useDownloadLink } from "../../queries";
import type { DesignAsset } from "../../types";
import { ASSET_DRAG_TYPE } from "./asset-drag";

const TILE_GRID = "grid grid-cols-2 gap-2";

/** One stored image: a button that places it, and a drag source for dropping it on the stage. */
function AssetTile({
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
  const link = useDownloadLink(designId, asset.assetId, true);
  const src = link.data?.url;
  return (
    <button
      type="button"
      draggable={!disabled}
      aria-label={`Thêm ảnh ${asset.originalName}`}
      title={asset.originalName}
      disabled={disabled}
      onClick={() => onPick(asset)}
      onDragStart={(event) => {
        event.dataTransfer.setData(ASSET_DRAG_TYPE, JSON.stringify(asset));
        event.dataTransfer.effectAllowed = "copy";
      }}
      className="bg-bg-subtle border-border-default hover:border-border-strong focus-visible:ring-accent relative aspect-square min-h-11 cursor-grab overflow-hidden rounded-[var(--r-md)] border outline-none focus-visible:ring-2 disabled:cursor-default disabled:opacity-50"
    >
      {src ? (
        <Image
          src={src}
          alt=""
          fill
          draggable={false}
          unoptimized={isRemoteImage(src)}
          sizes="7rem"
          className="object-contain p-1.5"
        />
      ) : link.isError ? (
        <span className="text-ink-tertiary absolute inset-0 flex items-center justify-center p-1 text-center text-xs">
          Không xem trước được
        </span>
      ) : (
        <Skeleton className="absolute inset-0 rounded-none" />
      )}
    </button>
  );
}

/**
 * "Ảnh của bạn": the images this design already holds as a grid of tiles. Clicking (or Enter on)
 * a tile calls `onPick`; dragging one onto the stage places it where it is dropped.
 */
export function ImageLibrary({
  designId,
  disabled,
  onPick,
}: {
  designId: string;
  disabled: boolean;
  onPick: (asset: DesignAsset) => void;
}) {
  const assets = useDesignAssets(designId, true);
  return (
    <section aria-label="Ảnh của bạn" className="flex flex-col gap-2">
      <h3 className="text-ink-primary text-sm font-semibold">Ảnh của bạn</h3>
      {assets.data ? (
        assets.data.length ? (
          <div className={TILE_GRID}>
            {assets.data.map((asset) => (
              <AssetTile
                key={asset.assetId}
                asset={asset}
                designId={designId}
                disabled={disabled}
                onPick={onPick}
              />
            ))}
          </div>
        ) : (
          <p className="text-ink-tertiary text-sm">Chưa có ảnh nào. Tải ảnh lên để bắt đầu.</p>
        )
      ) : assets.isError ? (
        <div role="alert" className="flex flex-col items-start gap-2">
          <Alert tone="danger">Chưa tải được danh sách ảnh.</Alert>
          <Button
            type="button"
            variant="outline"
            className="min-h-11 rounded-[var(--r-md)] px-4"
            onClick={() => void assets.refetch()}
          >
            Thử lại
          </Button>
        </div>
      ) : (
        <div aria-hidden className={TILE_GRID}>
          <Skeleton className="aspect-square rounded-[var(--r-md)]" />
          <Skeleton className="aspect-square rounded-[var(--r-md)]" />
        </div>
      )}
    </section>
  );
}
