"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Download, RotateCw } from "lucide-react";
import { useState } from "react";

import { Alert } from "@/components/shared";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { describeDesignError } from "../../errors";
import { invalidateDesign } from "../../mutations";
import { designDocumentQuery } from "../../queries";
import { downloadDocumentJson } from "./download-json";
import { useStudio } from "./studio-context";

/**
 * Spec §7.4: a save lost to a newer version (409) stops autosave and asks the customer what to do.
 * "Tải lại" loads the stored document (the edit history is cleared) and saving goes on from its
 * version; "Tải bản sao JSON" keeps a copy of what is on screen first. It cannot be dismissed:
 * editing on would only make changes that cannot be saved.
 */
export function ConflictDialog({ open }: { open: boolean }) {
  const { design, editor, autosave } = useStudio();
  const client = useQueryClient();
  const [reloading, setReloading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const reload = async () => {
    setReloading(true);
    setError(null);
    try {
      const record = await client.fetchQuery({ ...designDocumentQuery(design.id), staleTime: 0 });
      // While the conflict stands autosave ignores this change; `resume` then starts from it.
      editor.replaceDocument(record.document);
      autosave.resume(record.version, record.checksum);
      void invalidateDesign(client, design.id);
    } catch (failure) {
      setError(failure);
    } finally {
      setReloading(false);
    }
  };

  return (
    <Dialog open={open}>
      <DialogContent
        showCloseButton={false}
        className="bg-bg-surface text-ink-primary rounded-[var(--r-xl)] sm:max-w-md"
        onEscapeKeyDown={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Thiết kế đã thay đổi ở nơi khác</DialogTitle>
          <DialogDescription>
            Thiết kế vừa được lưu từ một cửa sổ hoặc thiết bị khác, nên thay đổi ở đây chưa được
            lưu. Tải lại để tiếp tục từ bản mới nhất; muốn giữ bản đang xem, hãy tải bản sao JSON
            trước.
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <div role="alert">
            <Alert tone="danger" title="Chưa tải lại được.">
              {describeDesignError(error)}
            </Alert>
          </div>
        ) : null}
        <DialogFooter className="border-border-default bg-bg-subtle">
          <Button
            type="button"
            variant="outline"
            className="min-h-11 rounded-[var(--r-md)] px-4"
            onClick={() => downloadDocumentJson(editor.store.getState().document, design.id)}
          >
            <Download aria-hidden className="mr-1.5 size-4" />
            Tải bản sao JSON
          </Button>
          <Button
            type="button"
            className="min-h-11 rounded-[var(--r-md)] px-4"
            disabled={reloading}
            onClick={() => void reload()}
          >
            <RotateCw aria-hidden className="mr-1.5 size-4" />
            Tải lại
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
