"use client";

import { Pencil } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import { Input } from "@/components/ui/input";

import { StudioIconButton } from "./studio-icon-button";

/** The BE's own limit on a design name (`@Size(max = 200)`). */
const NAME_MAX = 200;

/**
 * The design's name as the page heading, renamed in place: Enter or leaving the field keeps the
 * new name, Escape restores the old one. v1 keeps the name on this screen only (the BE has no
 * rename endpoint yet). Not offered while the design is read-only.
 */
export function DesignNameField({ name, editable }: { name: string; editable: boolean }) {
  const [value, setValue] = useState(name);
  const [draft, setDraft] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const editing = draft !== null;

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const commit = () => {
    const next = draft?.trim();
    if (next) setValue(next);
    setDraft(null);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") commit();
    if (event.key === "Escape") setDraft(null);
  };

  if (editing) {
    return (
      <Input
        ref={inputRef}
        aria-label="Tên thiết kế"
        value={draft}
        maxLength={NAME_MAX}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={onKeyDown}
        className="h-11 max-w-72 min-w-0 rounded-[var(--r-md)]"
      />
    );
  }
  return (
    <div className="flex min-w-0 items-center gap-0.5">
      <h1 className="text-ink-primary truncate text-base font-semibold">{value}</h1>
      {editable ? (
        <StudioIconButton label="Đổi tên thiết kế" onClick={() => setDraft(value)}>
          <Pencil aria-hidden />
        </StudioIconButton>
      ) : null}
    </div>
  );
}
