"use client";

import { useState } from "react";
import Link from "next/link";
import { CircleCheck, Building2, PhoneCall, KeyRound } from "lucide-react";

import { APP_ROUTES } from "@/constants";
import { Button } from "@/components/ui/button";
import { PageShell, SurfaceCard } from "@/components/storefront/layout";

import { LeadForm } from "./lead-form";

/** What happens after the form, so a visitor knows no account is opened on the spot (KE-HOACH §10.3). */
const NEXT_STEPS = [
  { icon: PhoneCall, text: "Sale gọi lại trong 1 ngày làm việc để tư vấn." },
  { icon: Building2, text: "Sale xác minh doanh nghiệp theo mã số thuế." },
  { icon: KeyRound, text: "Bạn nhận email mời kích hoạt tài khoản cổng khách hàng." },
] as const;

const SENT_MESSAGE = "Đã nhận yêu cầu, Sale sẽ liên hệ trong 1 ngày làm việc";

/**
 * `/mo-tai-khoan`: "Mở tài khoản doanh nghiệp / Yêu cầu tư vấn", channel B of KE-HOACH sales owner §10.3. Public: the
 * catalogue and the portal are for customers Sales verified, so a new business leaves a request instead of signing up.
 * Once sent, the same answer for everyone, a customer's company included.
 */
export function OpenAccountScreen() {
  const [sent, setSent] = useState(false);

  if (sent) {
    return (
      <PageShell width="narrow">
        <SurfaceCard className="grid justify-items-center gap-4 py-10 text-center" as="section">
          <CircleCheck aria-hidden className="text-positive size-12" />
          <div role="status" className="grid gap-2">
            <h1 className="font-display text-ink-primary text-xl font-bold sm:text-2xl">
              {SENT_MESSAGE}
            </h1>
            <p className="text-ink-secondary mx-auto max-w-[46ch] text-sm leading-6">
              Cảm ơn bạn đã quan tâm. Sale sẽ gọi hoặc gửi email theo thông tin bạn để lại.
            </p>
          </div>
          <div className="flex w-full flex-col justify-center gap-3 sm:flex-row">
            <Button asChild className="min-h-11 rounded-[var(--r-md)] px-5">
              <Link href={APP_ROUTES.home}>Về trang chủ</Link>
            </Button>
            <Button asChild variant="outline" className="min-h-11 rounded-[var(--r-md)] px-5">
              <Link href={APP_ROUTES.login}>Đăng nhập</Link>
            </Button>
          </div>
        </SurfaceCard>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Mở tài khoản doanh nghiệp"
      subtitle="Yêu cầu tư vấn: để lại thông tin, Sale sẽ liên hệ và mở tài khoản cho doanh nghiệp của bạn."
    >
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <SurfaceCard>
          <LeadForm onSent={() => setSent(true)} />
        </SurfaceCard>
        <SurfaceCard as="aside" className="grid gap-4">
          <h2 className="font-display text-ink-primary text-base font-semibold">Sau khi gửi</h2>
          <ol className="grid gap-3">
            {NEXT_STEPS.map(({ icon: Icon, text }) => (
              <li key={text} className="text-ink-secondary flex gap-3 text-sm leading-6">
                <Icon aria-hidden className="text-accent mt-1 size-4 shrink-0" />
                <span>{text}</span>
              </li>
            ))}
          </ol>
          <p className="border-border-default text-ink-secondary border-t pt-4 text-sm">
            Đã có tài khoản?{" "}
            <Link
              href={APP_ROUTES.login}
              className="text-accent inline-flex min-h-11 items-center font-medium hover:underline"
            >
              Đăng nhập
            </Link>
          </p>
        </SurfaceCard>
      </div>
    </PageShell>
  );
}
