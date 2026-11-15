"use client";

import Image from "next/image";

import { Alert, Skeleton } from "@/components/shared";

import { useProjectLibrary } from "../../queries";
import { RetryButton } from "../design-list-states";
import type { LibraryImage } from "../../types";
import { LIBRARY_DRAG_TYPE } from "./asset-drag";

const TILE_GRID = "grid grid-cols-2 gap-2";

/** One library image: a button that places it, and a drag source for dropping it on the stage. */
function LibraryTile({
  item,
  disabled,
  onPlace,
}: {
  item: LibraryImage;
  disabled: boolean;
  onPlace: (itemId: string) => void;
}) {
  return (
    <button
      type="button"
      draggable={!disabled}
      aria-label={`Thêm ảnh ${item.name} từ thư viện dự án`}
      title={item.name}
      disabled={disabled}
      onClick={() => onPlace(item.id)}
      onDragStart={(event) => {
        event.dataTransfer.setData(LIBRARY_DRAG_TYPE, item.id);
        event.dataTransfer.effectAllowed = "copy";
      }}
      className="bg-bg-subtle border-border-default hover:border-border-strong focus-visible:ring-accent relative aspect-square min-h-11 cursor-grab overflow-hidden rounded-[var(--r-md)] border outline-none focus-visible:ring-2 disabled:cursor-default disabled:opacity-50"
    >
      {item.previewUrl ? (
        <Image
          src={item.previewUrl}
          alt=""
          fill
          unoptimized
          draggable={false}
          sizes="7rem"
          className="object-contain p-1.5"
        />
      ) : (
        <span className="text-ink-tertiary absolute inset-0 flex items-center justify-center p-1 text-center text-xs">
          Không xem trước được
        </span>
      )}
    </button>
  );
}

/**
 * "Thư viện dự án" in the Ảnh panel of a design that belongs to a project: the images the project's
 * designs share. Clicking a tile, or dragging it onto the sheet, asks `onPlace` to copy it into
 * this design and place it (a closed project's images can still be placed, A-E2).
 */
export function ProjectLibraryImages({
  projectId,
  disabled,
  onPlace,
}: {
  projectId: string;
  disabled: boolean;
  onPlace: (itemId: string) => void;
}) {
  const library = useProjectLibrary(projectId);
  const images = library.data?.filter((item): item is LibraryImage => item.kind === "IMAGE");
  return (
    <section aria-label="Thư viện dự án" className="flex flex-col gap-2">
      <h3 className="text-ink-primary text-sm font-semibold">Thư viện dự án</h3>
      {images ? (
        images.length ? (
          <div className={TILE_GRID}>
            {images.map((item) => (
              <LibraryTile key={item.id} item={item} disabled={disabled} onPlace={onPlace} />
            ))}
          </div>
        ) : (
          <p className="text-ink-tertiary text-sm">
            Thư viện dự án chưa có ảnh nào. Tải ảnh lên ở trang dự án, hoặc lưu ảnh của bản này vào
            thư viện.
          </p>
        )
      ) : library.isError ? (
        <div role="alert" className="flex flex-col items-start gap-2">
          <Alert tone="danger">Chưa tải được thư viện dự án.</Alert>
          <RetryButton onRetry={() => void library.refetch()} retrying={library.isFetching} />
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
