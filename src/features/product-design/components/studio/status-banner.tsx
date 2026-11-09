"use client";

import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";

import { isReturned } from "../../lifecycle";
import { useDesignFiles } from "../../queries";
import type { Design } from "../../types";
import { ReadOnlyBanner } from "./read-only-banner";
import { StatusStrip } from "./status-strip";

/** An instant as the customer reads it (Asia/Ho_Chi_Minh); "—" when it cannot be read. */
const timeOf = (iso: string | null | undefined) =>
  iso && !Number.isNaN(Date.parse(iso)) ? formatDateTime(iso) : "—";

/** "Tải ảnh xem trước": the customer preview of the approved bundle, once the files are read. */
function PreviewDownload({ designId }: { designId: string }) {
  const files = useDesignFiles(designId, true);
  // A file's role is its purpose in the bundle, not a user's role.
  const preview = files.data?.find(({ role: purpose }) => purpose === "CUSTOMER_PREVIEW");
  if (!preview) return null;
  return (
    <Button asChild variant="outline" className="min-h-11 rounded-[var(--r-md)] px-3">
      <a href={preview.url} download={preview.name}>
        <Download aria-hidden className="size-4" />
        <span className="ml-1.5">Tải ảnh xem trước</span>
      </a>
    </Button>
  );
}

/**
 * Where the design stands, under the studio's header (spec §6.4): why a returned draft came back
 * and when; that a submitted design waits for the Sales Manager since it was sent; when an
 * approved one was approved, with its preview to download. Nothing for a plain draft.
 */
export function StatusBanner({ design }: { design: Design }) {
  if (isReturned(design) && design.lastReturn) {
    const { reason, returnedAt } = design.lastReturn;
    return <StatusStrip>{`Bị trả lại lúc ${timeOf(returnedAt)}: ${reason}`}</StatusStrip>;
  }
  if (design.status === "PENDING_REVIEW") {
    return (
      <ReadOnlyBanner>
        {`Đang chờ Quản lý kinh doanh duyệt — gửi lúc ${timeOf(design.submittedAt)}`}
      </ReadOnlyBanner>
    );
  }
  if (design.status === "APPROVED") {
    return (
      <ReadOnlyBanner action={<PreviewDownload designId={design.id} />}>
        {`Đã duyệt lúc ${timeOf(design.approvedAt)}`}
      </ReadOnlyBanner>
    );
  }
  return null;
}
