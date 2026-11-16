"use client";

import { Alert, Skeleton } from "@/components/shared";
import { Button } from "@/components/ui/button";

import { useProjectLibrary } from "../../queries";
import { RetryButton } from "../design-list-states";
import type { LibraryText } from "../../types";
import { useStudio } from "./studio-context";

/**
 * "Mẫu chữ của dự án" in the Chữ panel of a design that belongs to a project: the text styles saved
 * in the project's library, each drawn in its own font, weight and colour (the studio loads the
 * fonts; the project page does not). Choosing one asks `onPlace` to add a text with that content
 * and style.
 */
export function ProjectTextStyles({
  projectId,
  disabled,
  onPlace,
}: {
  projectId: string;
  disabled: boolean;
  onPlace: (item: LibraryText) => void;
}) {
  const { fonts } = useStudio();
  const library = useProjectLibrary(projectId);
  const texts = library.data?.filter((item): item is LibraryText => item.kind === "TEXT");
  return (
    <section aria-label="Mẫu chữ của dự án" className="flex flex-col gap-2">
      <h3 className="text-ink-primary text-sm font-semibold">Mẫu chữ của dự án</h3>
      {texts ? (
        texts.length ? (
          texts.map((item) => {
            const font = fonts[item.style.fontCode];
            return (
              <Button
                key={item.id}
                type="button"
                variant="outline"
                aria-label={`Thêm mẫu chữ ${item.name}`}
                disabled={disabled}
                onClick={() => onPlace(item)}
                className="h-auto min-h-11 flex-col items-start gap-0.5 rounded-[var(--r-md)] px-3 py-2 text-left"
              >
                <span
                  className="bg-bg-muted line-clamp-2 max-w-full rounded-[var(--r-sm)] px-1.5 text-base break-words whitespace-normal"
                  style={{
                    color: item.style.color,
                    fontFamily: font?.family,
                    fontWeight: item.style.bold ? 700 : 400,
                    fontStyle: item.style.italic && font?.italic ? "italic" : "normal",
                  }}
                >
                  {item.text}
                </span>
                <span className="text-ink-tertiary text-xs tabular-nums">
                  {font?.label ?? item.style.fontCode} · {item.style.sizePt} pt
                </span>
              </Button>
            );
          })
        ) : (
          <p className="text-ink-tertiary text-sm">
            Chưa có mẫu chữ nào. Chọn một chữ trên khung vẽ, rồi Thêm, Lưu thành mẫu chữ của dự án.
          </p>
        )
      ) : library.isError ? (
        <div role="alert" className="flex flex-col items-start gap-2">
          <Alert tone="danger">Chưa tải được mẫu chữ của dự án.</Alert>
          <RetryButton onRetry={() => void library.refetch()} retrying={library.isFetching} />
        </div>
      ) : (
        <Skeleton aria-hidden className="h-11 rounded-[var(--r-md)]" />
      )}
    </section>
  );
}
