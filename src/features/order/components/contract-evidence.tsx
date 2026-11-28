"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format/date";
import type { Contract } from "../contract-schemas";
import { formatVerificationCode } from "../contract-signing-rules";
import type { Signature } from "../contract-signing-schemas";
import { useContractRevisions } from "../contract-signing-queries";
import { getRevisionDocument, getSignaturePage } from "../contract-signing-api";
import { ContractLinkButton } from "./contract-link-button";

function SignatureDetails({ signature, title }: { signature: Signature; title: string }) {
  const inspection = signature.inspection;
  return (
    <div className="space-y-1 text-sm">
      <h3 className="text-ink-primary font-semibold">{title}</h3>
      <p>{[signature.signerName, signature.signerTitle].filter(Boolean).join(" · ")}</p>
      {signature.signedAt && (
        <p className="text-ink-secondary tabular-nums">{formatDateTime(signature.signedAt)}</p>
      )}
      {signature.email && <p className="text-ink-secondary break-all">{signature.email}</p>}
      {signature.otpVerified && <p>Đã xác thực qua email</p>}
      {signature.testCertificate && (
        <p className="text-ink-secondary">
          Chứng thư số dùng thử của hệ thống, không do tổ chức cung cấp dịch vụ chứng thực chữ ký số
          cấp.
        </p>
      )}
      {inspection && (
        <div role="status" className="text-ink-secondary space-y-1">
          {inspection.kind !== "SCAN" && inspection.kind !== "DIGITAL" && (
            <p>Không chấp nhận kết quả kiểm tra tài liệu này.</p>
          )}
          {inspection.kind === "SCAN" && <p>Bản scan — không có chữ ký số</p>}
          {inspection.kind === "DIGITAL" && (
            <p>
              {inspection.valid &&
              inspection.coversWholeDocument &&
              inspection.matchesSentDocument &&
              !inspection.signers?.some((signer) => signer.certificateValidAtSigning === false)
                ? "Chữ ký số hợp lệ"
                : "Chữ ký số chưa hợp lệ"}
            </p>
          )}
          {inspection.matchesSentDocument !== undefined && (
            <p>{inspection.matchesSentDocument ? "Khớp bản đã gửi" : "Không khớp bản đã gửi"}</p>
          )}
          {inspection.coversWholeDocument !== undefined && (
            <p>
              {inspection.coversWholeDocument
                ? "Chữ ký bao phủ toàn bộ tài liệu"
                : "Chữ ký không bao phủ toàn bộ tài liệu"}
            </p>
          )}
          {inspection.chainChecked === false && <p>Chưa kiểm tra chuỗi tin cậy của chứng thư.</p>}
          {inspection.signers?.map((signer, index) => (
            <p key={index} className="break-words">
              {signer.subject} {signer.issuer && `· Nơi cấp: ${signer.issuer}`}
              {signer.certificateValidAtSigning === true &&
                " · Chứng thư có hiệu lực tại thời điểm ký"}
              {signer.certificateValidAtSigning === false &&
                " · Chứng thư không có hiệu lực tại thời điểm ký"}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
export function ContractEvidence({ contract }: { contract: Contract }) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const code = contract.verificationCode;
  const displayedCode = code ? formatVerificationCode(code) : "";
  const signed = ["SIGNED", "COMPLETED", "LIQUIDATED"].includes(contract.status);
  return (
    <div className="space-y-3">
      {!contract.customerSignature && contract.customerSignedAt && (
        <p className="text-ink-secondary text-sm">
          Khách hàng ký lúc {formatDateTime(contract.customerSignedAt)}
        </p>
      )}
      {contract.customerSignature && (
        <SignatureDetails title="Chữ ký khách hàng" signature={contract.customerSignature} />
      )}
      {contract.companySignature && (
        <SignatureDetails title="Chữ ký công ty" signature={contract.companySignature} />
      )}
      {signed && code && (
        <>
          <ContractLinkButton
            label="Tải trang chứng nhận"
            load={() => getSignaturePage(contract.orderId)}
          />
          <div className="space-y-2 text-sm">
            <p className="break-all">
              Mã xác minh: <span className="font-mono">{displayedCode}</span>
            </p>
            <Button
              variant="outline"
              className="min-h-11"
              onClick={() => {
                if (!navigator.clipboard) {
                  setCopyError(true);
                  return;
                }
                void navigator.clipboard
                  .writeText(displayedCode)
                  .then(() => {
                    setCopied(true);
                    setCopyError(false);
                  })
                  .catch(() => setCopyError(true));
              }}
            >
              {copied ? "Đã sao chép" : "Sao chép mã xác minh"}
            </Button>
            {copyError && (
              <p role="alert">Chưa sao chép được. Vui lòng chọn và sao chép mã ở trên.</p>
            )}
            <Link
              className="text-accent flex min-h-11 items-center underline"
              href={`/xac-minh-hop-dong/${encodeURIComponent(code)}`}
            >
              Xác minh hợp đồng
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
export function ContractRevisions({ contract }: { contract: Contract }) {
  const query = useContractRevisions(contract.orderId, (contract.revision ?? 1) > 1);
  if ((contract.revision ?? 1) <= 1 || query.data === null) return null;
  return (
    <div className="border-border-default space-y-2 border-t pt-3">
      <h3 className="text-ink-primary text-sm font-semibold">
        Lịch sử phiên bản · hiện tại {contract.revision}
      </h3>
      {query.isPending && (
        <p role="status" className="text-ink-secondary text-sm">
          Đang tải lịch sử...
        </p>
      )}
      {query.isError && (
        <div role="alert">
          <p>Chưa tải được lịch sử phiên bản.</p>
          <Button variant="outline" className="min-h-11" onClick={() => void query.refetch()}>
            Thử lại
          </Button>
        </div>
      )}
      <ol className="space-y-3 text-sm">
        {query.data?.map((revision, index) => (
          <li key={revision.revision ?? index} className="space-y-1">
            <p className="font-medium">
              Phiên bản {revision.revision ?? "—"}
              {revision.sentAt && ` · ${formatDateTime(revision.sentAt)}`}
            </p>
            {revision.changeRequestReason && (
              <p className="text-ink-secondary break-words whitespace-pre-wrap">
                Lý do yêu cầu chỉnh sửa: {revision.changeRequestReason}
              </p>
            )}
            {revision.changeRequestedAt && (
              <p className="text-ink-secondary">
                Yêu cầu lúc {formatDateTime(revision.changeRequestedAt)}
              </p>
            )}
            {revision.documentAvailable && revision.revision && (
              <ContractLinkButton
                label={`Tải phiên bản ${revision.revision}`}
                load={() => getRevisionDocument(contract.orderId, revision.revision!)}
              />
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
