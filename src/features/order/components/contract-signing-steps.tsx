import Link from "next/link";
import { PenLine, Send } from "lucide-react";

import { STORE_ROUTES } from "@/constants";
import { Button } from "@/components/ui/button";

import { ContractDownloadButton } from "./contract-download-button";

/**
 * Where the signed scan goes: the contract's own conversation with Sales, so it is tied to the
 * contract rather than lost among chat files. `attach=pdf` travels to the thread, which asks for the
 * signed copy above its composer, with a button that opens the file picker.
 */
export const signedCopyHref = (contractId: string) =>
  STORE_ROUTES.chat.about("CONTRACT", contractId, "pdf");

/** The anchor of the order page's contract section, which chat cards link to. */
export const CONTRACT_SECTION_ID = "hop-dong";

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span
        aria-hidden
        className="border-border-strong text-ink-primary flex size-7 shrink-0 items-center justify-center rounded-full border text-sm font-semibold tabular-nums"
      >
        {n}
      </span>
      <div className="min-w-0 flex-1 space-y-2 pt-0.5">
        <p className="text-ink-primary text-sm font-semibold">
          <span className="sr-only">Bước {n}: </span>
          {title}
        </p>
        {children}
      </div>
    </li>
  );
}

/**
 * Signing a contract Sales sent, as three steps (SF-UX-24): download it, sign and stamp it, send the
 * signed copy back — the last one the primary action, opening the contract's conversation. The
 * contract stays "Chờ bạn ký" until Sales record the signature.
 */
export function ContractSigningSteps({
  orderId,
  contractId,
  contractNumber,
}: {
  orderId: string;
  contractId: string;
  contractNumber: string;
}) {
  return (
    <ol className="space-y-4" aria-label="Các bước ký hợp đồng">
      <Step n={1} title="Tải hợp đồng">
        <ContractDownloadButton
          orderId={orderId}
          contractNumber={contractNumber}
          label="Tải hợp đồng"
        />
      </Step>
      <Step n={2} title="Ký, đóng dấu">
        <p className="text-ink-secondary flex gap-2 text-sm">
          <PenLine aria-hidden className="mt-0.5 size-4 shrink-0" />
          In hợp đồng, người đại diện ký và đóng dấu công ty, rồi chụp hoặc quét thành file PDF.
        </p>
      </Step>
      <Step n={3} title="Gửi bản đã ký">
        <Button asChild className="min-h-11 w-full rounded-[var(--r-md)] px-4">
          <Link href={signedCopyHref(contractId)}>
            <Send aria-hidden className="mr-2 size-4" />
            Gửi bản đã ký
          </Link>
        </Button>
        <p className="text-ink-secondary text-xs">
          Gửi file trong cuộc trò chuyện về hợp đồng này. Sale xác nhận chữ ký, rồi hợp đồng chuyển
          sang Đã ký.
        </p>
      </Step>
    </ol>
  );
}
