"use client";

import { Upload } from "lucide-react";
import { useId, useState, type DragEvent } from "react";

import { Alert } from "@/components/shared";
import { cn } from "@/lib/cn";

import type { DesignAsset } from "../../types";
import { placeImage } from "./image-actions";
import { ImageLibrary } from "./image-library";
import { useEditorState, useStudio } from "./studio-context";
import {
  acceptedFormatNames,
  acceptedFormats,
  firstFile,
  UPLOAD_MESSAGES,
  useAssetPicker,
} from "./use-asset-upload";
import { usePasteImage } from "./use-paste-image";

/** "PNG, JPG hoặc SVG": the names in order, the last one after "hoặc". */
const formatList = (names: readonly string[]) =>
  names.length > 1 ? `${names.slice(0, -1).join(", ")} hoặc ${names.at(-1)}` : names.join("");

/**
 * The Image/Logo tool's options: a dropzone ("Kéo thả hoặc chọn ảnh") that also takes a paste on
 * the stage while it is open (closed, `ImagePaste` does), and the images already uploaded to this
 * design ("Ảnh của bạn", `ImageLibrary`). A picked, dropped or pasted file is stored and placed on
 * the active surface; picking an uploaded image places it again.
 */
export function ImageToolPanel() {
  const services = useStudio();
  const { design, template, stageRef } = services;
  const readOnly = useEditorState((s) => s.readOnly);
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
          // Files only: a tile of the library is placed on the stage, not uploaded again here.
          if (!Array.from(event.dataTransfer.types).includes("Files")) return;
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
          {formatList(acceptedFormatNames(template))}, tối đa {template.maxFileSizeMb} MB. Có thể
          dán ảnh (Ctrl+V) khi đang chọn khung vẽ.
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
      <ImageLibrary designId={design.id} disabled={readOnly || busy} onPick={place} />
    </div>
  );
}
