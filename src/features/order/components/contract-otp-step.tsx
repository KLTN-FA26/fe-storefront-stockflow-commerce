"use client";

import { useEffect, useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDateTime } from "@/lib/format/date";
import type { otpDtoSchema, SigningInput } from "../contract-signing-schemas";

export function ContractOtpStep({
  otp,
  form,
  attemptsLeft,
  pending,
  onResend,
  expiredByServer,
}: {
  otp: z.infer<typeof otpDtoSchema>;
  form: UseFormReturn<SigningInput>;
  attemptsLeft: number | undefined;
  pending: boolean;
  onResend: () => void;
  expiredByServer: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const resendSeconds = otp.resendAfter
    ? Math.max(0, Math.ceil((Date.parse(otp.resendAfter) - now) / 1000))
    : null;
  const expired = expiredByServer || Boolean(otp.expiresAt && Date.parse(otp.expiresAt) <= now);
  const { ref, ...field } = form.register("otp");
  return (
    <div className="space-y-3">
      <p className="text-ink-secondary text-sm">
        Mã xác thực đã gửi đến {otp.sentTo ?? "email của bạn"}.
      </p>
      <Label htmlFor="contract-otp">Mã xác thực gồm 6 chữ số</Label>
      <Input
        {...field}
        ref={ref}
        id="contract-otp"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        pattern="[0-9]{6}"
        className="text-lg tracking-widest tabular-nums"
        aria-invalid={Boolean(form.formState.errors.otp)}
        onChange={(event) =>
          form.setValue("otp", event.target.value.replace(/\D/g, "").slice(0, 6), {
            shouldValidate: true,
          })
        }
        onPaste={(event) => {
          event.preventDefault();
          form.setValue("otp", event.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6), {
            shouldValidate: true,
          });
        }}
      />
      {form.formState.errors.otp && (
        <p role="alert" className="text-danger-ink text-sm">
          {form.formState.errors.otp.message}
        </p>
      )}
      {attemptsLeft !== undefined && (
        <p role="status" className="text-ink-secondary text-sm">
          Còn {attemptsLeft} lần nhập mã.
        </p>
      )}
      {otp.expiresAt && (
        <p className="text-ink-secondary text-sm">Hết hạn: {formatDateTime(otp.expiresAt)}</p>
      )}
      {(expired || attemptsLeft === 0) && (
        <p role="status" className="text-danger-ink text-sm">
          Mã đã hết hạn hoặc hết lượt nhập. Vui lòng gửi mã mới.
        </p>
      )}
      <Button
        type="button"
        variant="outline"
        className="min-h-11"
        disabled={pending || resendSeconds === null || resendSeconds > 0}
        onClick={onResend}
      >
        {pending
          ? "Đang gửi mã..."
          : resendSeconds
            ? `Gửi lại mã sau ${resendSeconds} giây`
            : "Gửi lại mã"}
      </Button>
      {resendSeconds === null && (
        <p className="text-ink-secondary text-sm">
          Dịch vụ chưa cung cấp thời gian gửi lại mã. Vui lòng liên hệ Sale.
        </p>
      )}
      <Button
        type="submit"
        className="min-h-11 w-full"
        disabled={pending || expired || attemptsLeft === 0}
      >
        {pending ? "Đang xác thực..." : "Xác thực và ký hợp đồng"}
      </Button>
    </div>
  );
}
