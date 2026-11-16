"use client";

import { Check } from "lucide-react";
import { useId, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";

import type { ImageElement, TextElement } from "../../engine";
import { describeDesignError } from "../../errors";
import { libraryActions } from "../../library-rules";
import { useSaveImageToLibrary, useSaveTextStyle } from "../../library-mutations";
import type { Gate } from "../../project-rules";
import { useProjectLibrary } from "../../queries";
import type { Design } from "../../types";
import { RetryButton } from "../design-list-states";
import { useStudio } from "./studio-context";

type Project = NonNullable<Design["project"]>;

/**
 * The gate of a save into the project's library: shut (no reason yet) until the library is read,
 * shut with the reason and a retry when it cannot be read, then `libraryActions` says why not
 * (30 of the kind, or the project is closed, A-E2).
 */
function useSaveGate(project: Project, key: "saveText" | "addImage") {
  const library = useProjectLibrary(project.id);
  const retry = library.isError ? (
    <RetryButton onRetry={() => void library.refetch()} retrying={library.isFetching} />
  ) : null;
  if (library.data)
    return { gate: libraryActions(project, library.data)[key], retry, items: library.data };
  const shut: Gate = library.isError
    ? { allowed: false, reason: "Chưa tải được thư viện dự án" }
    : { allowed: false };
  return { gate: shut, retry, items: undefined };
}

/**
 * A button of "Thêm" with the reason it is locked written under it, the refusal that came back,
 * and, once it is stored, a visible "Đã lưu vào thư viện dự án": the button stays shut for that
 * element (`saved`) until it changes, so a second click does not store the same item again.
 */
function SaveItem({
  label,
  gate,
  pending,
  saved,
  error,
  retry,
  onSave,
}: {
  label: string;
  gate: Gate;
  pending: boolean;
  saved: boolean;
  error: string | null;
  retry?: ReactNode;
  onSave: () => void;
}) {
  const reasonId = useId();
  return (
    <div className="flex flex-col gap-1">
      <Button
        type="button"
        variant="outline"
        disabled={!gate.allowed || pending || saved}
        aria-describedby={gate.reason ? reasonId : undefined}
        onClick={onSave}
        className="min-h-11 justify-start rounded-[var(--r-md)] px-3"
      >
        {label}
      </Button>
      {gate.reason ? (
        <p id={reasonId} className="text-ink-tertiary text-xs">
          {gate.reason}
        </p>
      ) : null}
      {retry}
      {saved ? (
        <p className="text-positive flex items-center gap-1 text-xs">
          <Check aria-hidden className="size-3.5 shrink-0" />
          Đã lưu vào thư viện dự án
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-danger text-xs">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function SaveText({ project, element }: { project: Project; element: TextElement }) {
  const { announce } = useStudio();
  const save = useSaveTextStyle(project.id);
  const { gate, retry, items } = useSaveGate(project, "saveText");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ key: string; itemId: string } | null>(null);
  const blank = element.content.trim() === "";
  const input = {
    text: element.content,
    style: {
      fontCode: element.fontCode,
      sizePt: element.sizePt,
      color: element.color,
      bold: element.bold,
      italic: element.italic,
      align: element.align,
      letterSpacingEm: element.letterSpacingEm,
      lineHeight: element.lineHeight,
      ...(element.outline ? { outline: element.outline } : {}),
    },
  };
  // The element is part of the key: another selection starts unsaved.
  const key = `${element.id}|${JSON.stringify(input)}`;

  const onSave = async () => {
    setError(null);
    try {
      const item = await save.mutateAsync(input);
      setSaved({ key, itemId: item.id });
      announce("Đã lưu mẫu chữ vào thư viện dự án");
    } catch (failure) {
      setError(describeDesignError(failure));
    }
  };
  return (
    <SaveItem
      label="Lưu thành mẫu chữ của dự án"
      gate={blank ? { allowed: false, reason: "Chữ đang trống" } : gate}
      pending={save.isPending}
      saved={saved?.key === key && items?.some((i) => i.id === saved.itemId) === true}
      error={error}
      retry={retry}
      onSave={() => void onSave()}
    />
  );
}

function SaveImage({ project, element }: { project: Project; element: ImageElement }) {
  const { announce, design } = useStudio();
  const save = useSaveImageToLibrary(project.id);
  const { gate, retry, items } = useSaveGate(project, "addImage");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ key: string; itemId: string } | null>(null);
  const key = `${element.id}|${element.assetId}`;

  const onSave = async () => {
    setError(null);
    try {
      const item = await save.mutateAsync({ designId: design.id, assetId: element.assetId });
      setSaved({ key, itemId: item.id });
      announce("Đã lưu ảnh vào thư viện dự án");
    } catch (failure) {
      setError(describeDesignError(failure));
    }
  };
  return (
    <SaveItem
      label="Lưu ảnh vào thư viện dự án"
      gate={gate}
      pending={save.isPending}
      saved={saved?.key === key && items?.some((i) => i.id === saved.itemId) === true}
      error={error}
      retry={retry}
      onSave={() => void onSave()}
    />
  );
}

/** "Lưu thành mẫu chữ của dự án", in "Thêm" of a text bar; nothing for a design outside a project. */
export function SaveTextToProject({ element }: { element: TextElement }) {
  const { design } = useStudio();
  return design.project ? <SaveText project={design.project} element={element} /> : null;
}

/** "Lưu ảnh vào thư viện dự án", in "Thêm" of an image bar; nothing for a design outside a project. */
export function SaveImageToProject({ element }: { element: ImageElement }) {
  const { design } = useStudio();
  return design.project ? <SaveImage project={design.project} element={element} /> : null;
}
