"use client";

import { Upload } from "lucide-react";
import { useId, useState, type DragEvent, type ReactNode } from "react";

import { cn } from "@/lib/cn";

/**
 * The dashed box of an image upload ("Kéo thả hoặc chọn ảnh"), shared by the studio's Ảnh panel
 * and the project library: a hidden file input behind a label that covers the box, the hint under
 * it, and a drag highlight for files only (a tile of a library dragged over it is not a file).
 * `disabled` shuts both the input and the drop; `onFile` gets the first file picked or dropped.
 */
export function ImageDropzone({
  accept,
  hint,
  disabled,
  onFile,
  className,
}: {
  accept: string;
  hint: ReactNode;
  disabled: boolean;
  onFile: (file: File) => void;
  /** The box's own size, e.g. its min height. */
  className?: string;
}) {
  const [dragging, setDragging] = useState(false);
  const inputId = useId();
  const hintId = useId();

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file && !disabled) onFile(file);
  };

  return (
    <div
      onDragOver={(event) => {
        if (!Array.from(event.dataTransfer.types).includes("Files")) return;
        // Taken even while shut: a file that is not swallowed makes the browser open it and leave.
        event.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={cn(
        "border-border-strong focus-within:ring-accent relative flex flex-col items-center justify-center gap-1 rounded-[var(--r-lg)] border-2 border-dashed p-4 text-center focus-within:ring-2",
        dragging ? "bg-bg-muted border-accent" : "bg-bg-subtle",
        disabled && "opacity-60",
        className,
      )}
    >
      <input
        id={inputId}
        type="file"
        accept={accept}
        disabled={disabled}
        aria-describedby={hintId}
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = ""; // the same file can be picked again
          if (file) onFile(file);
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
        {hint}
      </p>
    </div>
  );
}
