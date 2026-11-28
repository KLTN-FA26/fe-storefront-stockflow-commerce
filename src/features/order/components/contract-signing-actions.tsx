"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useHasPermission } from "@/lib/auth/my-permissions";
import { PERM } from "@/lib/auth/permission-codes";
import { formatDate } from "@/lib/format/date";
import type { Contract } from "../contract-schemas";
import { contractSigningActions } from "../contract-signing-rules";
import { ContractDownloadButton } from "./contract-download-button";
import { ContractSigningDialog } from "./contract-signing-dialog";
import { ContractFallbackDialog } from "./contract-fallback-dialog";

export function ContractSigningActions({ contract }: { contract: Contract }) {
  const permitted = useHasPermission(PERM.ordersUpdate);
  const actions = contractSigningActions(contract, permitted);
  const [dialog, setDialog] = useState<"sign" | "change" | "upload" | null>(null);
  const [unavailable, setUnavailable] = useState<string[]>([]);
  const hide = () => {
    if (dialog) setUnavailable((previous) => [...previous, dialog]);
    setDialog(null);
  };
  return (
    <div className="space-y-3">
      {contract.status === "SENT" && (
        <>
          <ContractDownloadButton
            orderId={contract.orderId}
            contractNumber={contract.contractNumber}
            label="Tải hợp đồng"
          />
          {contract.signBy && (
            <p className="text-ink-secondary text-sm">
              Hạn ký: <span className="tabular-nums">{formatDate(contract.signBy)}</span>
            </p>
          )}
          {actions.overdue && (
            <p id="sign-deadline-help" role="status" className="text-danger-ink text-sm">
              Quá hạn ký. Vui lòng liên hệ Sale để gia hạn trước khi ký.
            </p>
          )}
          {actions.sign && !unavailable.includes("sign") && (
            <Button
              className="min-h-11 w-full"
              disabled={actions.overdue}
              aria-describedby={actions.overdue ? "sign-deadline-help" : undefined}
              onClick={() => setDialog("sign")}
            >
              Ký hợp đồng
            </Button>
          )}
          {actions.change && !unavailable.includes("change") && (
            <Button
              variant="outline"
              className="min-h-11 w-full"
              onClick={() => setDialog("change")}
            >
              Yêu cầu chỉnh sửa
            </Button>
          )}
          {actions.sign && !unavailable.includes("upload") && (
            <Button
              variant="link"
              className="min-h-11 w-full"
              disabled={actions.overdue}
              aria-describedby={actions.overdue ? "sign-deadline-help" : undefined}
              onClick={() => setDialog("upload")}
            >
              Tải lên bản đã ký
            </Button>
          )}
        </>
      )}
      {dialog === "sign" && (
        <ContractSigningDialog
          contract={contract}
          onClose={() => setDialog(null)}
          onUnavailable={hide}
        />
      )}
      {(dialog === "upload" || dialog === "change") && (
        <ContractFallbackDialog
          mode={dialog}
          contract={contract}
          onClose={() => setDialog(null)}
          onUnavailable={hide}
        />
      )}
    </div>
  );
}
