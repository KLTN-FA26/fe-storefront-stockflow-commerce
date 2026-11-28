"use client";

import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ApiError } from "@/lib/api/error";
import type { Contract } from "../contract-schemas";
import { requestContractOtp, signContract, isSigningUnavailable } from "../contract-signing-api";
import {
  ELECTRONIC_CONSENT,
  signingInputSchema,
  signingConsentSchema,
  type SigningInput,
} from "../contract-signing-schemas";
import { describeSigningError } from "../contract-signing-rules";
import { useContractAction } from "../contract-signing-queries";
import { ContractDownloadButton } from "./contract-download-button";
import { ContractSignerFields } from "./contract-signer-fields";
import { ContractOtpStep } from "./contract-otp-step";

export function ContractSigningDialog({
  contract,
  onClose,
  onUnavailable,
}: {
  contract: Contract;
  onClose: () => void;
  onUnavailable: () => void;
}) {
  const [step, setStep] = useState<"consent" | "otp" | "success">("consent");
  const [attemptsLeft, setAttemptsLeft] = useState<number>();
  const form = useForm<SigningInput>({
    resolver: zodResolver(signingInputSchema),
    defaultValues: {
      signerName: contract.buyerSigner?.name ?? "",
      signerTitle: contract.buyerSigner?.title ?? "",
      read: false,
      consent: false,
      otp: "",
    },
  });
  const read = useWatch({ control: form.control, name: "read" });
  const consent = useWatch({ control: form.control, name: "consent" });
  const otp = useMutation({
    mutationFn: () => requestContractOtp(contract.orderId),
    onSuccess: (data) => {
      if (!data.sentTo || !data.expiresAt || !data.resendAfter) {
        onUnavailable();
        return;
      }
      setStep("otp");
      setAttemptsLeft(5);
      form.setValue("otp", "");
      sign.reset();
    },
    onError: (error) => {
      if (isSigningUnavailable(error)) onUnavailable();
    },
  });
  const sign = useContractAction(
    contract.orderId,
    (input: SigningInput) => signContract(contract.orderId, contract.version, input),
    "Đã ký hợp đồng, chờ công ty ký.",
  );
  const pending = otp.isPending || sign.isPending;
  const sendOtp = () => {
    const result = signingConsentSchema.safeParse(form.getValues());
    if (!result.success) {
      void form.trigger(["signerName", "signerTitle", "read", "consent"]);
      return;
    }
    otp.mutate();
  };
  const submit = form.handleSubmit((input) =>
    sign.mutate(input, {
      onSuccess: () => setStep("success"),
      onError: (error) => {
        if (isSigningUnavailable(error)) {
          onUnavailable();
          return;
        }
        if (error instanceof ApiError && typeof error.details?.attemptsLeft === "number")
          setAttemptsLeft(error.details.attemptsLeft);
      },
    }),
  );
  const error = otp.error ?? sign.error;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <DialogContent
        className="bg-bg-surface border-border-default max-h-[90dvh] overflow-y-auto rounded-[var(--r-xl)] sm:max-w-lg"
        showCloseButton={!pending}
      >
        <DialogHeader>
          <DialogTitle>Ký hợp đồng</DialogTitle>
          <DialogDescription>
            {contract.contractNumber} ·{" "}
            {step === "consent"
              ? "Bước 1: Đọc và xác nhận"
              : step === "otp"
                ? "Bước 2: Xác thực email"
                : "Bước 3: Hoàn tất"}
          </DialogDescription>
        </DialogHeader>
        {step === "success" ? (
          <div className="space-y-4">
            <p role="status">
              Đã ký, chờ công ty ký. Hợp đồng có hiệu lực khi công ty hoàn tất ký.
            </p>
            <Button className="min-h-11 w-full" onClick={onClose}>
              Hoàn tất
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4" noValidate>
            <fieldset disabled={pending} className="space-y-4">
              {step === "consent" ? (
                <>
                  <ContractDownloadButton
                    orderId={contract.orderId}
                    contractNumber={contract.contractNumber}
                    label="Tải hợp đồng PDF"
                  />
                  <label className="flex min-h-11 items-start gap-3 text-sm">
                    <Checkbox
                      checked={read}
                      onCheckedChange={(value) =>
                        form.setValue("read", value === true, { shouldValidate: true })
                      }
                    />
                    Tôi đã đọc và hiểu nội dung hợp đồng.
                  </label>
                  <ContractSignerFields register={form.register} errors={form.formState.errors} />
                  <label className="flex min-h-11 items-start gap-3 text-sm">
                    <Checkbox
                      checked={consent}
                      onCheckedChange={(value) =>
                        form.setValue("consent", value === true, { shouldValidate: true })
                      }
                    />
                    <span>{ELECTRONIC_CONSENT}</span>
                  </label>
                  {(form.formState.errors.read || form.formState.errors.consent) && (
                    <p role="alert" className="text-danger-ink text-sm">
                      Vui lòng xác nhận đã đọc và đồng ý ký điện tử.
                    </p>
                  )}
                  <Button type="button" className="min-h-11 w-full" onClick={sendOtp}>
                    {pending ? "Đang gửi mã..." : "Gửi mã xác thực"}
                  </Button>
                </>
              ) : otp.isPending ? (
                <p role="status">Đang gửi mã xác thực...</p>
              ) : (
                otp.data && (
                  <ContractOtpStep
                    otp={otp.data}
                    form={form}
                    attemptsLeft={attemptsLeft}
                    pending={pending}
                    expiredByServer={
                      sign.error instanceof ApiError && sign.error.code === "CONTRACT_OTP_EXPIRED"
                    }
                    onResend={sendOtp}
                  />
                )
              )}
            </fieldset>
            {error && (
              <p role="alert" className="text-danger-ink text-sm">
                {describeSigningError(error)}
              </p>
            )}
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
