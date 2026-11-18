"use client";

import { formatDateTime } from "@/lib/format";

import { isReturned } from "../../lifecycle";
import { RequestQuoteButton } from "../design-quote-request";
import type { Design } from "../../types";
import { ReadOnlyBanner } from "./read-only-banner";
import { StatusStrip } from "./status-strip";
import { SubmittedFiles } from "./submitted-files";

/** An instant as the customer reads it (Asia/Ho_Chi_Minh); "—" when it cannot be read. */
const timeOf = (iso: string | null | undefined) =>
  iso && !Number.isNaN(Date.parse(iso)) ? formatDateTime(iso) : "—";

/**
 * Where the design stands, under the studio's header (spec §6.4): why a returned draft came back
 * and when; that a submitted design waits for the Sales Manager since it was sent; when an
 * approved one was approved. A sent design also offers the files it was sent with, an approved
 * one "Yêu cầu báo giá" too (docs 12 §4.8.23). Nothing for a plain draft.
 */
export function StatusBanner({ design }: { design: Design }) {
  if (isReturned(design) && design.lastReturn) {
    const { reason, returnedAt } = design.lastReturn;
    return <StatusStrip>{`Bị trả lại lúc ${timeOf(returnedAt)}: ${reason}`}</StatusStrip>;
  }
  if (design.status === "PENDING_REVIEW") {
    return (
      <ReadOnlyBanner action={<SubmittedFiles designId={design.id} />}>
        {`Đang chờ Quản lý kinh doanh duyệt — gửi lúc ${timeOf(design.submittedAt)}`}
      </ReadOnlyBanner>
    );
  }
  if (design.status === "APPROVED") {
    return (
      <ReadOnlyBanner
        action={
          <div className="flex flex-wrap items-center gap-2">
            <RequestQuoteButton design={design} className="px-3" />
            <SubmittedFiles designId={design.id} approved />
          </div>
        }
      >
        {`Đã duyệt lúc ${timeOf(design.approvedAt)}`}
      </ReadOnlyBanner>
    );
  }
  return null;
}
