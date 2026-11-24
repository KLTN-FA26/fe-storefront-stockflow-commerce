"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { KeyRound, Loader2 } from "lucide-react";

import { Alert } from "@/components/shared";
import { PasswordInput } from "@/components/shared/PasswordInput";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

import { activatePortalAccount } from "../api";
import { describeActivationError, isInvitationInvalid } from "../errors";
import { activationFormSchema, type ActivationFormValues } from "../schemas";

interface ActivationFormProps {
  token: string;
  /** The account is active: `email` signs in, with the password just chosen. */
  onActivated: (email: string, password: string) => Promise<void>;
  /** The BE refused the link itself: the form has nothing more to offer. */
  onInvalidLink: () => void;
}

/** The two password fields of the activation page, validated by the BE's password policy before sending. */
export function ActivationForm({ token, onActivated, onInvalidLink }: ActivationFormProps) {
  const [error, setError] = useState<string>();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ActivationFormValues>({
    resolver: zodResolver(activationFormSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  const onSubmit = handleSubmit(async ({ password }) => {
    setError(undefined);
    let email: string;
    try {
      email = await activatePortalAccount({ token, password });
    } catch (failure) {
      if (isInvitationInvalid(failure)) return onInvalidLink();
      return setError(describeActivationError(failure));
    }
    await onActivated(email, password);
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="activate-password">Mật khẩu mới</Label>
        <PasswordInput
          id="activate-password"
          autoComplete="new-password"
          aria-invalid={errors.password ? true : undefined}
          aria-describedby={errors.password ? "activate-password-error" : "activate-password-hint"}
          {...register("password")}
        />
        {errors.password ? (
          <p id="activate-password-error" role="alert" className="text-danger text-sm">
            {errors.password.message}
          </p>
        ) : (
          <p id="activate-password-hint" className="text-ink-tertiary text-xs">
            10–72 ký tự, có chữ hoa, chữ thường và chữ số.
          </p>
        )}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="activate-confirm">Nhập lại mật khẩu</Label>
        <PasswordInput
          id="activate-confirm"
          autoComplete="new-password"
          aria-invalid={errors.confirmPassword ? true : undefined}
          aria-describedby={errors.confirmPassword ? "activate-confirm-error" : undefined}
          {...register("confirmPassword")}
        />
        {errors.confirmPassword ? (
          <p id="activate-confirm-error" role="alert" className="text-danger text-sm">
            {errors.confirmPassword.message}
          </p>
        ) : null}
      </div>

      {error ? (
        <div role="alert">
          <Alert tone="danger" title="Chưa kích hoạt được.">
            {error}
          </Alert>
        </div>
      ) : null}

      <Button type="submit" className="min-h-11 w-full rounded-[var(--r-md)]" disabled={isSubmitting}>
        {isSubmitting ? (
          <Loader2 aria-hidden className="size-4 animate-spin" />
        ) : (
          <KeyRound aria-hidden className="size-4" />
        )}
        {isSubmitting ? "Đang kích hoạt..." : "Kích hoạt tài khoản"}
      </Button>
    </form>
  );
}
