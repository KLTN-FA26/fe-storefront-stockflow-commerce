"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { APP_ROUTES, STORE_ROUTES } from "@/constants";
import { KeyRound } from "lucide-react";

import { Alert } from "@/components/shared";
import { AuthHeading } from "@/components/storefront/auth/auth-heading";
import { Button } from "@/components/ui/button";
import { useHydrated } from "@/hooks/use-hydrated";
import { signInCustomer } from "@/lib/auth/customer-session";

import { ActivationForm } from "./activation-form";

/**
 * The invitation token, from the link's fragment (`#token=…`): a fragment never reaches a server or an access log.
 * Read once, on the client.
 */
function readToken(): string | null {
  if (typeof window === "undefined") return null;
  const token = new URLSearchParams(window.location.hash.slice(1)).get("token")?.trim();
  return token ? token : null;
}

type Outcome = "form" | "invalid" | { activated: string };

/**
 * `/portal/activate`, the page the invitation e-mail opens: a customer Sales onboarded chooses the password of their
 * account (there is no self sign-up: SCRUM-450). Once the BE accepts it, the customer is signed in with the e-mail it
 * answers and the password just typed; if that sign-in fails, the page says the account is ready and leads to login.
 */
export function ActivationScreen() {
  const router = useRouter();
  const hydrated = useHydrated();
  const [token] = useState(readToken);
  const [outcome, setOutcome] = useState<Outcome>(token ? "form" : "invalid");

  // The secret has been read: take it out of the address bar and the history entry.
  useEffect(() => {
    if (window.location.hash) {
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    }
  }, []);

  const onActivated = async (email: string, password: string) => {
    try {
      const { mustChangePassword } = await signInCustomer({ username: email, password });
      router.replace(mustChangePassword ? STORE_ROUTES.account.security : APP_ROUTES.home);
    } catch {
      setOutcome({ activated: email });
    }
  };

  // The token lives in the browser only: nothing to show before hydration.
  if (!hydrated) return <div className="min-h-64 w-full" aria-busy="true" />;

  if (outcome === "invalid" || !token) {
    return (
      <Panel
        title="Link kích hoạt không dùng được"
        body="Link không hợp lệ, đã hết hạn (sau 72 giờ) hoặc đã được dùng. Vui lòng liên hệ Sales của StockFlow để được gửi link mới."
      >
        <LoginButton label="Về trang đăng nhập" />
      </Panel>
    );
  }

  if (typeof outcome === "object") {
    return (
      <Panel title="Tài khoản đã được kích hoạt">
        <Alert tone="info" title="Bạn có thể đăng nhập ngay.">
          Tên đăng nhập của bạn là <span className="font-medium break-all">{outcome.activated}</span>.
        </Alert>
        <LoginButton label="Đăng nhập" />
      </Panel>
    );
  }

  return (
    <Panel
      title="Kích hoạt tài khoản"
      body="Đặt mật khẩu cho tài khoản StockFlow mà Sales đã tạo cho doanh nghiệp của bạn. Sau đó bạn đăng nhập bằng email nhận được lời mời."
    >
      <ActivationForm token={token} onActivated={onActivated} onInvalidLink={() => setOutcome("invalid")} />
    </Panel>
  );
}

function Panel({ title, body, children }: { title: string; body?: string; children: ReactNode }) {
  return (
    <div className="w-full space-y-7">
      <AuthHeading icon={KeyRound} title={title} description={body} />
      {children}
    </div>
  );
}

function LoginButton({ label }: { label: string }) {
  return (
    <Button asChild className="min-h-11 w-full rounded-[var(--r-md)]">
      <Link href={APP_ROUTES.login}>{label}</Link>
    </Button>
  );
}
