"use client";

import type { ReactNode } from "react";

import { Alert, EmptyState, Skeleton } from "@/components/shared";

import { describeProjectError } from "../errors";
import { LIBRARY_LIMIT } from "../library-rules";
import type { Gate } from "../project-rules";
import type { LibraryImage, LibraryItem, LibraryText } from "../types";
import { RetryButton } from "./design-list-states";
import { LibraryDropzone } from "./project-library-dropzone";
import { ImageTile, TextRow } from "./project-library-rows";

export type PanelProps = {
  items: readonly LibraryItem[] | undefined;
  isError: boolean;
  error: unknown;
  retrying: boolean;
  onRetry: () => void;
  removeGate: Gate;
  onRemove: (item: LibraryItem) => void;
};

/** The same wait, failure and retry for both tabs; `children` draws the items that were read. */
function Loaded({ panel, children }: { panel: PanelProps; children: ReactNode }) {
  if (panel.items) return children;
  if (panel.isError) {
    return (
      <div role="alert" className="flex flex-col items-start gap-2">
        <Alert tone="danger">{describeProjectError(panel.error)}</Alert>
        <RetryButton onRetry={panel.onRetry} retrying={panel.retrying} />
      </div>
    );
  }
  return (
    <div
      role="status"
      aria-label="Đang tải thư viện"
      className="grid grid-cols-2 gap-3 sm:grid-cols-4"
    >
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="aspect-square rounded-[var(--r-lg)]" />
      ))}
    </div>
  );
}

const Counter = ({ count, label }: { count: number; label: string }) => (
  <p className="text-ink-secondary text-sm">
    {label}{" "}
    <span className="text-ink-primary font-medium tabular-nums">{`${count}/${LIBRARY_LIMIT}`}</span>
  </p>
);

export function LibraryImagesPanel({
  projectId,
  addGate,
  ...panel
}: PanelProps & { projectId: string; addGate: Gate }) {
  const images = panel.items?.filter((item): item is LibraryImage => item.kind === "IMAGE");
  return (
    <Loaded panel={panel}>
      <Counter count={images?.length ?? 0} label="Ảnh trong thư viện" />
      <LibraryDropzone projectId={projectId} gate={addGate} />
      {images?.length ? (
        <ul
          aria-label="Ảnh của dự án"
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
        >
          {images.map((item) => (
            <ImageTile
              key={item.id}
              item={item}
              gate={panel.removeGate}
              onRemove={() => panel.onRemove(item)}
            />
          ))}
        </ul>
      ) : (
        <EmptyState
          title="Chưa có ảnh nào"
          description="Tải ảnh lên, hoặc lưu ảnh từ một bản thiết kế trong studio."
        />
      )}
    </Loaded>
  );
}

export function LibraryTextsPanel(panel: PanelProps) {
  const texts = panel.items?.filter((item): item is LibraryText => item.kind === "TEXT");
  return (
    <Loaded panel={panel}>
      <Counter count={texts?.length ?? 0} label="Mẫu chữ trong thư viện" />
      {texts?.length ? (
        <ul aria-label="Mẫu chữ của dự án" className="grid gap-2 sm:grid-cols-2">
          {texts.map((item) => (
            <TextRow
              key={item.id}
              item={item}
              gate={panel.removeGate}
              onRemove={() => panel.onRemove(item)}
            />
          ))}
        </ul>
      ) : (
        <EmptyState
          title="Chưa có mẫu chữ nào"
          description="Mở một bản trong studio, chọn chữ rồi chọn Thêm, Lưu thành mẫu chữ của dự án."
        />
      )}
    </Loaded>
  );
}
