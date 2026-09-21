"use client";

import { useState } from "react";
import { CheckCircle2, LoaderCircle, ShieldCheck } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { Alert } from "@/components/shared/Alert";
import { toast } from "@/components/shared/Toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { changePasswordSchema, type ChangePasswordFormValues } from "../schemas";
import { useChangePassword } from "../mutations";

function fieldError(error: { message?: string } | undefined, id: string) {
  return error?.message ? (
    <p id={id} className="text-danger text-sm" role="alert">
      {error.message}
    </p>
  ) : null;
}

export function ChangePasswordForm() {
  const mutation = useChangePassword();
  const [serverError, setServerError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const form = useForm<ChangePasswordFormValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmNewPassword: "",
      logoutOtherDevices: false,
    },
    mode: "onBlur",
  });

  const onSubmit = form.handleSubmit((values) => {
    if (mutation.isPending) return;
    setServerError(null);
    setSuccessMessage(null);
    mutation.mutate(
      {
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
        logoutOtherDevices: values.logoutOtherDevices,
      },
      {
        onSuccess: (result) => {
          form.reset();
          if (values.logoutOtherDevices && result.revokedSessions > 0) {
            const message = `Đổi mật khẩu thành công. ${result.revokedSessions} thiết bị khác đã được đăng xuất.`;
            setSuccessMessage(message);
            toast.success(message);
          } else {
            setSuccessMessage("Đổi mật khẩu thành công.");
            toast.success("Đổi mật khẩu thành công.");
          }
        },
        onError: (error) => {
          if (error.code === "INVALID_CURRENT_PASSWORD") {
            form.setError("currentPassword", {
              type: "server",
              message: "Mật khẩu hiện tại không đúng",
            });
            return;
          }

          if (error.code === "PASSWORD_UNCHANGED") {
            form.setError("newPassword", {
              type: "server",
              message: "Mật khẩu mới phải khác mật khẩu hiện tại",
            });
            return;
          }

          if (error.code === "VALIDATION_FAILED") {
            let mapped = false;
            for (const detail of error.fieldErrorDetails) {
              if (detail.field === "currentPassword" || detail.field === "newPassword") {
                form.setError(detail.field, { type: "server", message: detail.message });
                mapped = true;
              }
            }
            if (mapped) return;
          }

          setServerError(
            error.code === "RATE_LIMITED"
              ? "Bạn đã thử quá nhiều lần. Vui lòng thử lại sau."
              : error.message,
          );
        },
      },
    );
  });

  const errors = form.formState.errors;

  return (
    <section className="border-border-default bg-bg-surface rounded-[var(--r-xl)] border p-[var(--card-pad)] shadow-[var(--sh-sm)]">
      <div className="mb-6">
        <ShieldCheck className="text-accent mb-3 size-6" aria-hidden="true" />
        <h1 className="font-display text-ink-primary text-2xl font-bold sm:text-3xl">
          Đổi mật khẩu
        </h1>
        <p className="text-ink-secondary mt-2 text-sm">
          Dùng mật khẩu dài từ 10 đến 72 ký tự, gồm chữ hoa, chữ thường và chữ số.
        </p>
      </div>

      {serverError && (
        <Alert tone="danger" title="Không thể đổi mật khẩu" className="mb-5">
          {serverError}
        </Alert>
      )}

      {successMessage && !form.formState.isDirty && (
        <div className="text-positive mb-5 flex items-center gap-2 text-sm" role="status">
          <CheckCircle2 className="size-4" aria-hidden="true" /> {successMessage}
        </div>
      )}

      <form onSubmit={onSubmit} noValidate className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="current-password">Mật khẩu hiện tại</Label>
          <Input
            id="current-password"
            type="password"
            autoComplete="current-password"
            aria-invalid={Boolean(errors.currentPassword)}
            aria-describedby={errors.currentPassword ? "current-password-error" : undefined}
            {...form.register("currentPassword")}
          />
          {fieldError(errors.currentPassword, "current-password-error")}
        </div>

        <div className="space-y-2">
          <Label htmlFor="new-password">Mật khẩu mới</Label>
          <Input
            id="new-password"
            type="password"
            autoComplete="new-password"
            aria-invalid={Boolean(errors.newPassword)}
            aria-describedby={errors.newPassword ? "new-password-error" : undefined}
            {...form.register("newPassword")}
          />
          {fieldError(errors.newPassword, "new-password-error")}
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirm-new-password">Xác nhận mật khẩu mới</Label>
          <Input
            id="confirm-new-password"
            type="password"
            autoComplete="new-password"
            aria-invalid={Boolean(errors.confirmNewPassword)}
            aria-describedby={errors.confirmNewPassword ? "confirm-new-password-error" : undefined}
            {...form.register("confirmNewPassword")}
          />
          {fieldError(errors.confirmNewPassword, "confirm-new-password-error")}
        </div>

        <label className="border-border-default bg-bg-muted/30 flex cursor-pointer items-start gap-3 rounded-[var(--r-md)] border p-3">
          <input
            type="checkbox"
            className="accent-accent mt-1 size-4"
            {...form.register("logoutOtherDevices")}
          />
          <span>
            <span className="text-ink-primary block text-sm font-medium">
              Đăng xuất khỏi các thiết bị khác
            </span>
            <span className="text-ink-secondary mt-1 block text-xs">
              Khi bật, mọi phiên hoạt động khác sẽ bị thu hồi ngay lập tức. Thiết bị hiện tại vẫn
              được đăng nhập.
            </span>
          </span>
        </label>

        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending && (
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          )}
          {mutation.isPending ? "Đang cập nhật..." : "Cập nhật mật khẩu"}
        </Button>
      </form>
    </section>
  );
}
