"use client";

import { useState } from "react";

import { Alert, ConfirmDialog } from "@/components/shared";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { describeProjectError } from "../errors";
import { libraryActions } from "../library-rules";
import { useDeleteLibraryItem } from "../library-mutations";
import { useProjectLibrary } from "../queries";
import type { DesignProject, LibraryItem } from "../types";
import { LibraryImagesPanel, LibraryTextsPanel } from "./project-library-panels";

const TAB = "min-h-11 rounded-[var(--r-md)] px-4";

/**
 * The project's library on its page (spec 2026-11-12 §5): "Ảnh" (upload, "n/30", grid, delete with
 * confirm) and "Chữ" (the saved text styles, delete; they are only made from the studio). A closed
 * project's library is read-only (`libraryActions`). Deleting never touches the designs that used
 * an item (docs 12 BR-18), and the confirm says so.
 */
export function ProjectLibrary({ project }: { project: DesignProject }) {
  const library = useProjectLibrary(project.id);
  const remove = useDeleteLibraryItem(project.id);
  const [removing, setRemoving] = useState<LibraryItem | null>(null);
  const items = library.data;
  const gates = libraryActions(project, items ?? []);
  const shared = {
    items,
    isError: library.isError,
    error: library.error,
    retrying: library.isFetching,
    onRetry: () => void library.refetch(),
    removeGate: gates.remove,
    onRemove: (item: LibraryItem) => {
      remove.reset();
      setRemoving(item);
    },
  };

  return (
    <section aria-labelledby="project-library-title" className="space-y-3">
      <h2 id="project-library-title" className="text-ink-primary text-lg font-semibold">
        Thư viện dự án
      </h2>
      <p className="text-ink-secondary text-sm">
        Ảnh và mẫu chữ dùng chung cho các bản trong dự án. Đặt vào bản nào thì bản đó giữ một bản
        sao riêng.
      </p>
      <Tabs defaultValue="images">
        <TabsList variant="line" aria-label="Thư viện dự án" className="h-auto">
          <TabsTrigger value="images" className={TAB}>
            Ảnh
          </TabsTrigger>
          <TabsTrigger value="texts" className={TAB}>
            Chữ
          </TabsTrigger>
        </TabsList>
        <TabsContent value="images" className="space-y-3 pt-2">
          <LibraryImagesPanel projectId={project.id} addGate={gates.addImage} {...shared} />
        </TabsContent>
        <TabsContent value="texts" className="space-y-3 pt-2">
          <LibraryTextsPanel {...shared} />
        </TabsContent>
      </Tabs>
      {remove.isError ? (
        <div role="alert">
          <Alert tone="danger">{describeProjectError(remove.error)}</Alert>
        </div>
      ) : null}
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => (open ? undefined : setRemoving(null))}
        title={removing?.kind === "TEXT" ? "Xoá mẫu chữ này?" : "Xoá ảnh này?"}
        description={`"${removing?.name ?? ""}" sẽ bị xoá khỏi thư viện. Các bản đã dùng nó không bị ảnh hưởng, kể cả bản đã gửi duyệt.`}
        confirmLabel="Xoá"
        cancelLabel="Huỷ"
        onConfirm={() => removing && remove.mutate(removing)}
      />
    </section>
  );
}
