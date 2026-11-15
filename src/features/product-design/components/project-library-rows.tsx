"use client";

import { Trash2 } from "lucide-react";
import Image from "next/image";

import { Button } from "@/components/ui/button";

import { fontLabelOf } from "../library-labels";
import type { Gate } from "../project-rules";
import type { LibraryImage, LibraryText } from "../types";

function RemoveButton({
  label,
  gate,
  onClick,
}: {
  label: string;
  gate: Gate;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      aria-label={label}
      title={gate.allowed ? label : gate.reason}
      disabled={!gate.allowed}
      onClick={onClick}
      className="text-ink-secondary hover:text-danger min-h-11 min-w-11 shrink-0 rounded-[var(--r-md)]"
    >
      <Trash2 aria-hidden className="size-4" />
    </Button>
  );
}

/** One library image on the project page: its picture, name and "Xoá". */
export function ImageTile({
  item,
  gate,
  onRemove,
}: {
  item: LibraryImage;
  gate: Gate;
  onRemove: () => void;
}) {
  const src = item.previewUrl;
  return (
    <li className="bg-bg-surface border-border-default flex flex-col overflow-hidden rounded-[var(--r-lg)] border shadow-[var(--sh-sm)]">
      <div className="bg-bg-subtle relative aspect-square">
        {src ? (
          <Image
            src={src}
            alt=""
            fill
            unoptimized
            sizes="(min-width: 640px) 25vw, 50vw"
            className="object-contain p-2"
          />
        ) : (
          <span className="text-ink-tertiary absolute inset-0 flex items-center justify-center p-2 text-center text-xs">
            Không xem trước được
          </span>
        )}
      </div>
      <div className="flex items-center gap-1 pl-3">
        <span className="text-ink-primary min-w-0 flex-1 truncate text-sm" title={item.name}>
          {item.name}
        </span>
        <RemoveButton label={`Xoá ảnh ${item.name}`} gate={gate} onClick={onRemove} />
      </div>
    </li>
  );
}

/**
 * One saved text style on the project page (Q2): the text in the default font, then "font · size"
 * and a swatch of its colour; the studio draws it in its own font.
 */
export function TextRow({
  item,
  gate,
  onRemove,
}: {
  item: LibraryText;
  gate: Gate;
  onRemove: () => void;
}) {
  const { style } = item;
  return (
    <li className="bg-bg-surface border-border-default flex items-center gap-2 rounded-[var(--r-lg)] border py-1 pr-1 pl-3 shadow-[var(--sh-sm)]">
      <div className="min-w-0 flex-1 py-2">
        <p className="text-ink-primary line-clamp-2 text-sm font-medium break-words">{item.text}</p>
        <p className="text-ink-tertiary mt-0.5 flex items-center gap-1.5 text-xs">
          <span className="tabular-nums">{`${fontLabelOf(style.fontCode)} · ${style.sizePt} pt`}</span>
          <span
            role="img"
            aria-label={`Màu ${style.color}`}
            className="border-border-strong size-3.5 shrink-0 rounded-full border"
            style={{ backgroundColor: style.color }}
          />
        </p>
      </div>
      <RemoveButton label={`Xoá mẫu chữ ${item.name}`} gate={gate} onClick={onRemove} />
    </li>
  );
}
