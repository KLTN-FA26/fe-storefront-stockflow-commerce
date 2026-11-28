"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { parseAsString, useQueryState } from "nuqs";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, LockKeyhole, LogIn, MailCheck, ShieldCheck } from "lucide-react";

import { APP_ROUTES, STORE_ROUTES } from "@/constants";
import { Alert } from "@/components/shared";
import { PasswordInput } from "@/components/shared/PasswordInput";
import { AuthHeading } from "@/components/storefront/auth/auth-heading";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signInCustomer } from "@/lib/auth/customer-session";
import { safeNextPath } from "@/lib/auth/safe-next";
import { useHasSession } from "@/lib/auth/use-signed-in";

import { asksToContactSales, describeLoginError } from "../errors";
import { ContactSalesLink } from "./contact-sales-link";
import { loginFormSchema, type LoginFormValues } from "../schemas";

export function LoginScreen() {
  const router = useRouter();
  const hasSession = useHasSession();
  const [rawNext] = useQueryState("next", parseAsString);
  // Only a same-origin path: `?next=https://evil.example` must not make this page a redirector.
  const next = safeNextPath(rawNext);
  const [error, setError] = useState<{ text: string; contactSales: boolean }>();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: { username: "", password: "" },
  });

  // Already signed in (or just did): this page has nothing to offer.
  useEffect(() => {
    if (hasSession) router.replace(next);
  }, [hasSession, next, router]);

  const onSubmit = handleSubmit(async (values) => {
    setError(undefined);
    try {
      const { mustChangePassword } = await signInCustomer(values);
      // A password an administrator set must be replaced before anything else.
      router.replace(mustChangePassword ? STORE_ROUTES.account.security : next);
    } catch (failure) {
      setError({ text: describeLoginError(failure), contactSales: asksToContactSales(failure) });
    }
  });

  return (
    // The page (`(auth)` layout) is the frame: the form is not boxed in a card of its own.
    <div className="w-full space-y-7">
      <AuthHeading
        icon={LockKeyhole}
        title="Chào mừng trở lại"
        description="Đăng nhập cổng khách sỉ để thiết kế ly, xem báo giá, hợp đồng và theo dõi đơn của doanh nghiệp bạn."
      />

      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="login-username">Tên đăng nhập</Label>
          <Input
            id="login-username"
            placeholder="Email hoặc tên đăng nhập"
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            className="min-h-11"
            aria-invalid={errors.username ? true : undefined}
            aria-describedby={errors.username ? "login-username-error" : undefined}
            {...register("username")}
          />
          {errors.username ? (
            <p id="login-username-error" role="alert" className="text-danger text-sm">
              {errors.username.message}
            </p>
          ) : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="login-password">Mật khẩu</Label>
          <PasswordInput
            id="login-password"
            placeholder="Nhập mật khẩu"
            autoComplete="current-password"
            aria-invalid={errors.password ? true : undefined}
            aria-describedby={errors.password ? "login-password-error" : undefined}
            {...register("password")}
          />
          {errors.password ? (
            <p id="login-password-error" role="alert" className="text-danger text-sm">
              {errors.password.message}
            </p>
          ) : null}
        </div>

        {error ? (
          <div role="alert">
            <Alert tone="danger" title="Không đăng nhập được.">
              {error.text}
            </Alert>
            {error.contactSales ? <ContactSalesLink /> : null}
          </div>
        ) : null}

        <Button
          type="submit"
          className="min-h-11 w-full rounded-[var(--r-md)]"
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <Loader2 aria-hidden className="size-4 animate-spin" />
          ) : (
            <LogIn aria-hidden className="size-4" />
          )}
          {isSubmitting ? "Đang đăng nhập..." : "Đăng nhập"}
        </Button>
      </form>

      <p className="bg-bg-subtle text-ink-secondary rounded-[var(--r-md)] px-4 py-3 text-sm">
        Chưa có tài khoản doanh nghiệp?{" "}
        <Link
          href={APP_ROUTES.openAccount}
          className="text-accent focus-visible:ring-accent rounded-sm font-medium hover:underline focus-visible:ring-2 focus-visible:outline-none"
        >
          Gửi yêu cầu mở tài khoản
        </Link>
      </p>

      <div className="border-border-default text-ink-tertiary space-y-2.5 border-t pt-5 text-xs leading-5">
        <p className="flex gap-2">
          <MailCheck aria-hidden className="text-accent mt-0.5 size-4 shrink-0" />
          <span>
            <span className="text-ink-secondary font-medium">Lần đầu dùng cổng?</span> Mở link kích
            hoạt trong email mời của StockFlow để đặt mật khẩu, rồi đăng nhập bằng email đó.
          </span>
        </p>
        <p className="flex gap-2">
          <ShieldCheck aria-hidden className="text-positive mt-0.5 size-4 shrink-0" />
          <span>
            Chưa có tài khoản hoặc quên mật khẩu? Tài khoản khách hàng do Sale cấp, vui lòng liên hệ
            Sale của StockFlow để được hỗ trợ.
          </span>
        </p>
      </div>
    </div>
  );
}
