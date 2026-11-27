"use client";

import { useRef, useState } from "react";
import { Download, Upload } from "lucide-react";

import { Alert, toast } from "@/components/shared";
import { SurfaceCard } from "@/components/storefront/layout";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format/date";

import { getCreditRequestFileUrl } from "../api";
import { describeCreditRequestError, useAttachCreditRequestFile } from "../mutations";
import { CREDIT_REQUEST_FILE_LIMITS } from "../schemas";

import type { CreditRequest } from "../schemas";

/** Documents of the request: download any; add one while the request is open (≤ 25 MB, ≤ 10 files). */
export function FilesCard({ request, canAttach }: { request: CreditRequest; canAttach: boolean }) {
  const files = request.files ?? [];
  const attach = useAttachCreditRequestFile();
  const input = useRef<HTMLInputElement>(null);
  const [tooLarge, setTooLarge] = useState(false);
  const full = files.length >= CREDIT_REQUEST_FILE_LIMITS.maxFiles;

  const pick = (file: File | undefined) => {
    setTooLarge(false);
    attach.reset();
    if (!file) return;
    if (file.size > CREDIT_REQUEST_FILE_LIMITS.maxBytes) {
      setTooLarge(true);
      return;
    }
    attach.mutate({ id: request.id, file });
  };
  const download = async (fileId: string) => {
    try {
      window.open(await getCreditRequestFileUrl(request.id, fileId), "_blank", "noopener");
    } catch (error: unknown) {
      toast.error(describeCreditRequestError(error));
    }
  };

  return (
    <SurfaceCard className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-ink-primary text-base font-semibold">Giấy tờ</h2>
        {canAttach ? (
          <>
            <input
              ref={input}
              type="file"
              className="sr-only"
              aria-label="Chọn giấy tờ"
              accept={CREDIT_REQUEST_FILE_LIMITS.accept}
              onChange={(e) => {
                pick(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <Button
              variant="outline"
              className="min-h-11 rounded-[var(--r-md)] px-4"
              disabled={attach.isPending || full}
              onClick={() => input.current?.click()}
            >
              <Upload aria-hidden className="mr-2 size-4" />
              {attach.isPending ? "Đang tải lên..." : "Tải giấy tờ"}
            </Button>
          </>
        ) : null}
      </div>
      {canAttach ? (
        <p className="text-ink-tertiary text-xs">
          PDF, Word, Excel, JPEG, PNG — mỗi tệp tối đa 25 MB, tối đa 10 tệp.
        </p>
      ) : null}
      {tooLarge || attach.error ? (
        <div role="alert">
          <Alert tone="danger">
            {tooLarge ? "Tệp vượt 25 MB." : describeCreditRequestError(attach.error)}
          </Alert>
        </div>
      ) : null}
      {files.length === 0 ? (
        <p className="text-ink-secondary text-sm">Chưa có giấy tờ.</p>
      ) : (
        <ul className="divide-border-default divide-y">
          {files.map((file) => (
            <li key={file.id} className="flex min-h-11 items-center gap-3 py-1">
              <span
                className="text-ink-primary min-w-0 flex-1 truncate text-sm"
                title={file.fileName}
              >
                {file.fileName}
              </span>
              <span className="text-ink-tertiary text-xs">{formatDate(file.uploadedAt)}</span>
              <Button
                variant="ghost"
                className="min-h-11 min-w-11"
                aria-label={`Tải ${file.fileName}`}
                onClick={() => void download(file.id)}
              >
                <Download aria-hidden className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </SurfaceCard>
  );
}
