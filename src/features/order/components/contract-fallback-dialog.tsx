"use client";

import { useForm, useWatch } from "react-hook-form";
import { useIsMutating } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Contract } from "../contract-schemas";
import { changeRequestInputSchema, uploadSigningInputSchema } from "../contract-signing-schemas";
import {
  isSigningUnavailable,
  requestContractChanges,
  uploadContractSignature,
} from "../contract-signing-api";
import { signingKeys, useContractAction } from "../contract-signing-queries";
import { describeSigningError } from "../contract-signing-rules";
import { ContractSignerFields } from "./contract-signer-fields";

export function ContractFallbackDialog({
  mode,
  contract,
  onClose,
  onUnavailable,
}: {
  mode: "upload" | "change";
  contract: Contract;
  onClose: () => void;
  onUnavailable: () => void;
}) {
  const pending = useIsMutating({ mutationKey: signingKeys.action(contract.orderId) }) > 0;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <DialogContent
        showCloseButton={!pending}
        className="bg-bg-surface border-border-default max-h-[90dvh] overflow-y-auto rounded-[var(--r-xl)] sm:max-w-lg"
      >
        <DialogHeader>
          <DialogTitle>{mode === "upload" ? "Tải lên bản đã ký" : "Yêu cầu chỉnh sửa"}</DialogTitle>
          <DialogDescription>{contract.contractNumber}</DialogDescription>
        </DialogHeader>
        {mode === "upload" ? (
          <UploadForm contract={contract} onClose={onClose} onUnavailable={onUnavailable} />
        ) : (
          <ChangeForm contract={contract} onClose={onClose} onUnavailable={onUnavailable} />
        )}
      </DialogContent>
    </Dialog>
  );
}
type Props = { contract: Contract; onClose: () => void; onUnavailable: () => void };
function ChangeForm({ contract, onClose, onUnavailable }: Props) {
  const form = useForm<z.infer<typeof changeRequestInputSchema>>({
    resolver: zodResolver(changeRequestInputSchema),
    defaultValues: { reason: "" },
  });
  const reason = useWatch({ control: form.control, name: "reason" });
  const mutation = useContractAction(
    contract.orderId,
    ({ reason }: z.infer<typeof changeRequestInputSchema>) =>
      requestContractChanges(contract.orderId, contract.version, reason),
    "Đã gửi yêu cầu chỉnh sửa hợp đồng.",
  );
  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={form.handleSubmit((input) =>
        mutation.mutate(input, {
          onSuccess: onClose,
          onError: (e) => {
            if (isSigningUnavailable(e)) onUnavailable();
          },
        }),
      )}
    >
      <p className="text-ink-secondary text-sm">
        Xác nhận gửi yêu cầu: hợp đồng hiện tại sẽ trở về bản nháp. Sale sẽ chuẩn bị phiên bản mới
        để bạn xem và ký.
      </p>
      <Label htmlFor="change-reason">Lý do cần chỉnh sửa (10–2.000 ký tự)</Label>
      <Textarea
        id="change-reason"
        rows={5}
        maxLength={2000}
        disabled={mutation.isPending}
        aria-invalid={Boolean(form.formState.errors.reason)}
        {...form.register("reason")}
      />
      <p className="text-ink-secondary text-xs">{reason.length}/2.000 ký tự</p>
      {form.formState.errors.reason && (
        <p role="alert" className="text-danger-ink text-sm">
          {form.formState.errors.reason.message}
        </p>
      )}
      {mutation.error && (
        <p role="alert" className="text-danger-ink text-sm">
          {describeSigningError(mutation.error)}
        </p>
      )}
      <Button type="submit" className="min-h-11 w-full" disabled={mutation.isPending}>
        {mutation.isPending ? "Đang gửi..." : "Xác nhận gửi yêu cầu"}
      </Button>
    </form>
  );
}
function UploadForm({ contract, onClose, onUnavailable }: Props) {
  const form = useForm<
    z.input<typeof uploadSigningInputSchema>,
    unknown,
    z.output<typeof uploadSigningInputSchema>
  >({
    resolver: zodResolver(uploadSigningInputSchema),
    defaultValues: { signerName: "", signerTitle: "" },
  });
  const mutation = useContractAction(
    contract.orderId,
    (input: z.output<typeof uploadSigningInputSchema>) =>
      uploadContractSignature(
        contract.orderId,
        contract.version,
        input.file!,
        input.signerName,
        input.signerTitle,
      ),
    "Đã nhận bản ký, chờ công ty ký.",
  );
  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={form.handleSubmit((input) =>
        mutation.mutate(input, {
          onSuccess: onClose,
          onError: (e) => {
            if (isSigningUnavailable(e)) onUnavailable();
          },
        }),
      )}
    >
      <p className="text-ink-secondary text-sm">
        Tải bản scan đã ký hoặc PDF có chữ ký số. Hệ thống kiểm tra chữ ký và nội dung so với bản đã
        gửi.
      </p>
      <fieldset disabled={mutation.isPending} className="space-y-4">
        <ContractSignerFields register={form.register} errors={form.formState.errors} />
        <Label htmlFor="signed-pdf">Bản đã ký (PDF, tối đa 20 MB)</Label>
        <Input
          id="signed-pdf"
          type="file"
          accept="application/pdf,.pdf"
          {...form.register("file")}
        />
        {form.formState.errors.file && (
          <p role="alert" className="text-danger-ink text-sm">
            {form.formState.errors.file.message}
          </p>
        )}
      </fieldset>
      {mutation.error && (
        <p role="alert" className="text-danger-ink text-sm">
          {describeSigningError(mutation.error)}
        </p>
      )}
      <Button type="submit" className="min-h-11 w-full" disabled={mutation.isPending}>
        {mutation.isPending ? "Đang kiểm tra file..." : "Tải lên và xác nhận ký"}
      </Button>
    </form>
  );
}
