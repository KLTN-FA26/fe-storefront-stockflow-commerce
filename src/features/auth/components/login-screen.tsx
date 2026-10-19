"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { parseAsString, useQueryState } from "nuqs";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, LogIn } from "lucide-react";

import { STORE_ROUTES } from "@/constants";
import { Alert } from "@/components/shared";
import { SurfaceCard } from "@/components/storefront/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signInCustomer } from "@/lib/auth/customer-session";
import { safeNextPath } from "@/lib/auth/safe-next";
import { useHasSession } from "@/lib/auth/use-signed-in";

import { describeLoginError } from "../errors";
import { loginFormSchema, type LoginFormValues } from "../schemas";

export function LoginScreen() {
  const router = useRouter();
  const hasSession = useHasSession();
  const [rawNext] = useQueryState("next", parseAsString);
  // Only a same-origin path: `?next=https://evil.example` must not make this page a redirector.
  const next = safeNextPath(rawNext);
  const [error, setError] = useState<string>();
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
      setError(describeLoginError(failure));
    }
  });

  return (
    <SurfaceCard className="mx-auto w-full max-w-md space-y-5">
      <div className="space-y-1">
        <h1 className="font-display text-ink-primary text-2xl font-bold">Đăng nhập</h1>
        <p className="text-ink-secondary text-sm">
          Cổng khách hàng dành cho khách sỉ đã được StockFlow cấp tài khoản.
        </p>
      </div>

      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="login-username">Email đăng nhập</Label>
          <Input
            id="login-username"
            type="email"
            autoComplete="username"
            inputMode="email"
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
          <Input
            id="login-password"
            type="password"
            autoComplete="current-password"
            className="min-h-11"
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
              {error}
            </Alert>
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

      <p className="text-ink-tertiary text-xs">
        Chưa có tài khoản hoặc quên mật khẩu? Tài khoản khách hàng do Sales cấp, vui lòng liên hệ
        Sales của StockFlow để được hỗ trợ.
      </p>
    </SurfaceCard>
  );
}
