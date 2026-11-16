"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { ImagePlus, X } from "lucide-react";

import { Button } from "@/components/ui/button";

interface PhotoPickerProps {
  files: readonly File[];
  onChange: (files: File[]) => void;
  /** Ảnh tối đa còn được thêm (tính cả ảnh đã có ở nơi khác). */
  max: number;
  maxBytes: number;
  accept: readonly string[];
  label: string;
  hint?: string;
  disabled?: boolean;
  /** Lỗi của form (vd. "Cần ít nhất 1 ảnh"). */
  error?: string | undefined;
}

const MB = 1024 * 1024;

/**
 * Chọn ảnh từ máy / camera, xem trước, bỏ ảnh. Kiểm loại và dung lượng ngay khi chọn để khách
 * không phải chờ tải lên mới biết ảnh bị từ chối; máy chủ vẫn kiểm lại.
 */
export function PhotoPicker({
  files,
  onChange,
  max,
  maxBytes,
  accept,
  label,
  hint,
  disabled,
  error,
}: PhotoPickerProps) {
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [rejected, setRejected] = useState<string | null>(null);
  const previews = useMemo(() => files.map((file) => URL.createObjectURL(file)), [files]);
  useEffect(() => () => previews.forEach((url) => URL.revokeObjectURL(url)), [previews]);

  const add = (picked: FileList | null) => {
    if (!picked) return;
    const next = [...files];
    const problems: string[] = [];
    for (const file of Array.from(picked)) {
      if (!accept.includes(file.type)) problems.push(`${file.name}: chỉ nhận JPEG, PNG, WebP`);
      else if (file.size > maxBytes)
        problems.push(`${file.name}: lớn hơn ${Math.round(maxBytes / MB)} MB`);
      else if (next.length >= max) problems.push(`Tối đa ${max} ảnh`);
      else next.push(file);
    }
    setRejected(problems.length > 0 ? [...new Set(problems)].join(" · ") : null);
    onChange(next);
    if (input.current) input.current.value = "";
  };

  const message = rejected ?? error;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <label htmlFor={inputId} className="text-ink-primary text-sm font-medium">
          {label}
        </label>
        <span className="text-ink-tertiary text-xs tabular-nums">
          {files.length}/{max} ảnh
        </span>
      </div>
      {hint ? <p className="text-ink-secondary text-xs">{hint}</p> : null}
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5" aria-label="Ảnh đã chọn">
        {files.map((file, index) => (
          <li
            key={`${file.name}-${index}`}
            className="border-border-default bg-bg-subtle relative aspect-square overflow-hidden rounded-[var(--r-md)] border"
          >
            {previews[index] ? (
              // Ảnh cục bộ (blob:): không qua bộ tối ưu ảnh của Next.
              <Image
                src={previews[index]}
                alt={file.name}
                fill
                unoptimized
                sizes="8rem"
                className="object-cover"
              />
            ) : null}
            <Button
              type="button"
              size="icon"
              variant="secondary"
              disabled={disabled}
              className="absolute top-1 right-1 size-8 rounded-full"
              aria-label={`Bỏ ảnh ${file.name}`}
              onClick={() => onChange(files.filter((_, i) => i !== index))}
            >
              <X aria-hidden className="size-4" />
            </Button>
          </li>
        ))}
        {files.length < max ? (
          <li>
            <Button
              type="button"
              variant="outline"
              disabled={disabled}
              className="border-border-strong text-ink-secondary aspect-square size-full min-h-11 flex-col gap-1 rounded-[var(--r-md)] border-dashed text-xs"
              onClick={() => input.current?.click()}
            >
              <ImagePlus aria-hidden className="size-5" />
              Thêm ảnh
            </Button>
          </li>
        ) : null}
      </ul>
      <input
        ref={input}
        id={inputId}
        type="file"
        accept={accept.join(",")}
        multiple
        disabled={disabled}
        className="sr-only"
        onChange={(event) => add(event.target.files)}
      />
      {message ? (
        <p role="alert" className="text-danger text-xs">
          {message}
        </p>
      ) : null}
    </div>
  );
}
