"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, LoaderCircle, RefreshCw } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { Alert } from "@/components/shared/Alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/shared/Toast";
import { ApiError } from "@/lib/api/error";

import {
  customerProfileFormSchema,
  type CustomerProfile,
  type CustomerProfileFormValues,
} from "../schemas";
import { useCustomerProfile } from "../queries";
import { useUpdateCustomerProfile } from "../mutations";

function formValues(profile: CustomerProfile): CustomerProfileFormValues {
  return { fullName: profile.fullName, phone: profile.phone ?? "" };
}

function isCustomerNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.code === "CUSTOMER_NOT_FOUND";
}

export function CustomerProfileForm() {
  const profileQuery = useCustomerProfile();
  const updateMutation = useUpdateCustomerProfile();
  const [serverError, setServerError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [reloadError, setReloadError] = useState(false);
  const [isReloading, setIsReloading] = useState(false);
  const form = useForm<CustomerProfileFormValues>({
    resolver: zodResolver(customerProfileFormSchema),
    defaultValues: { fullName: "", phone: "" },
    mode: "onBlur",
  });

  useEffect(() => {
    if (profileQuery.data && !form.formState.isDirty) {
      form.reset(formValues(profileQuery.data));
    }
  }, [form, form.formState.isDirty, profileQuery.data]);

  const reloadLatest = async () => {
    if (isReloading || profileQuery.isFetching) return;
    setIsReloading(true);
    try {
      const result = await profileQuery.refetch();
      if (!result.isSuccess) {
        setReloadError(true);
        return;
      }
      form.reset(formValues(result.data));
      setConflict(false);
      setReloadError(false);
      setServerError(null);
    } catch {
      setReloadError(true);
    } finally {
      setIsReloading(false);
    }
  };

  const onSubmit = form.handleSubmit((values) => {
    if (!profileQuery.data || updateMutation.isPending || conflict) return;
    setServerError(null);
    setConflict(false);

    updateMutation.mutate(
      {
        fullName: values.fullName.trim(),
        phone: values.phone.trim() || null,
        version: profileQuery.data.version,
      },
      {
        onSuccess: (profile) => {
          form.reset(formValues(profile));
          toast.success("Đã cập nhật thông tin tài khoản");
        },
        onError: (error) => {
          if (error.code === "OPTIMISTIC_LOCK") {
            setConflict(true);
            return;
          }

          const fieldErrors = error.fieldErrors ?? {};
          let mappedFieldError = false;
          for (const field of ["fullName", "phone"] as const) {
            const message = fieldErrors[field];
            if (message) {
              form.setError(field, { type: "server", message });
              mappedFieldError = true;
            }
          }
          if (
            !mappedFieldError ||
            Object.keys(fieldErrors).some((field) => !["fullName", "phone"].includes(field))
          ) {
            setServerError(error.message);
          }
        },
      },
    );
  });

  if (profileQuery.isLoading) {
    return (
      <div role="status" aria-label="Đang tải thông tin tài khoản" className="space-y-4">
        <div className="bg-bg-muted h-6 w-48 animate-pulse rounded" />
        <div className="bg-bg-muted h-12 animate-pulse rounded-[var(--r-lg)]" />
        <div className="bg-bg-muted h-12 animate-pulse rounded-[var(--r-lg)]" />
      </div>
    );
  }

  if (profileQuery.error && (isCustomerNotFound(profileQuery.error) || !profileQuery.data)) {
    if (isCustomerNotFound(profileQuery.error)) {
      return (
        <Alert tone="warning" title="Chưa có hồ sơ khách hàng">
          Tài khoản đăng nhập chưa được liên kết với hồ sơ khách hàng.
        </Alert>
      );
    }

    return (
      <Alert tone="danger" title="Không tải được thông tin tài khoản">
        <div className="flex flex-wrap items-center gap-3">
          <span>Vui lòng thử lại.</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void profileQuery.refetch()}
          >
            <RefreshCw className="size-4" /> Thử lại
          </Button>
        </div>
      </Alert>
    );
  }

  if (!profileQuery.data) return null;

  return (
    <section className="border-border-default bg-bg-surface rounded-[var(--r-xl)] border p-[var(--card-pad)] shadow-[var(--sh-sm)]">
      <div className="mb-6">
        <p className="text-ink-secondary text-sm">Tài khoản</p>
        <h1 className="font-display text-ink-primary text-2xl font-bold sm:text-3xl">
          Thông tin cá nhân
        </h1>
        <p className="text-ink-secondary mt-2 text-sm">Cập nhật thông tin liên hệ của bạn.</p>
      </div>

      {conflict && (
        <Alert tone="warning" title="Thông tin đã thay đổi ở nơi khác" className="mb-5">
          <div className="flex flex-wrap items-center gap-3">
            <span>Hãy tải dữ liệu mới nhất trước khi lưu tiếp.</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isReloading || profileQuery.isFetching}
              aria-busy={isReloading}
              onClick={() => void reloadLatest()}
            >
              {isReloading ? (
                <>
                  <LoaderCircle className="size-4 animate-spin" />
                  <span role="status">Đang tải lại...</span>
                </>
              ) : (
                <>
                  <RefreshCw className="size-4" /> Tải lại dữ liệu
                </>
              )}
            </Button>
          </div>
        </Alert>
      )}

      {reloadError && (
        <Alert tone="danger" title="Không thể tải dữ liệu mới nhất" className="mb-5">
          <span role="alert">Bản nháp của bạn vẫn được giữ nguyên. Vui lòng thử lại.</span>
        </Alert>
      )}

      {serverError && (
        <Alert tone="danger" title="Không thể lưu thông tin" className="mb-5">
          {serverError}
        </Alert>
      )}

      <form onSubmit={onSubmit} noValidate className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="customer-profile-full-name">Họ và tên</Label>
          <Input
            id="customer-profile-full-name"
            autoComplete="name"
            aria-invalid={Boolean(form.formState.errors.fullName)}
            aria-describedby={
              form.formState.errors.fullName ? "customer-profile-full-name-error" : undefined
            }
            {...form.register("fullName")}
          />
          {form.formState.errors.fullName?.message && (
            <p id="customer-profile-full-name-error" className="text-danger text-sm" role="alert">
              {form.formState.errors.fullName.message}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="customer-profile-email">Email</Label>
          <Input
            id="customer-profile-email"
            value={profileQuery.data.email}
            readOnly
            aria-readonly="true"
          />
          <p className="text-ink-tertiary text-xs">
            Email là định danh đăng nhập và chưa thể thay đổi.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="customer-profile-phone">Số điện thoại</Label>
          <Input
            id="customer-profile-phone"
            type="tel"
            autoComplete="tel"
            aria-invalid={Boolean(form.formState.errors.phone)}
            aria-describedby={
              form.formState.errors.phone ? "customer-profile-phone-error" : undefined
            }
            {...form.register("phone")}
          />
          {form.formState.errors.phone?.message && (
            <p id="customer-profile-phone-error" className="text-danger text-sm" role="alert">
              {form.formState.errors.phone.message}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <Button type="submit" disabled={updateMutation.isPending || conflict}>
            {updateMutation.isPending && <LoaderCircle className="size-4 animate-spin" />}
            {updateMutation.isPending ? "Đang lưu..." : "Lưu thay đổi"}
          </Button>
          {updateMutation.isSuccess && !form.formState.isDirty && !conflict && (
            <span className="text-positive inline-flex items-center gap-1.5 text-sm" role="status">
              <CheckCircle2 className="size-4" /> Đã lưu
            </span>
          )}
          {updateMutation.isError &&
            updateMutation.error.code !== "OPTIMISTIC_LOCK" &&
            !serverError && (
              <span className="text-danger inline-flex items-center gap-1.5 text-sm" role="alert">
                <AlertCircle className="size-4" /> Có lỗi khi lưu
              </span>
            )}
        </div>
      </form>
    </section>
  );
}
