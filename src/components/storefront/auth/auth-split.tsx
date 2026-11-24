import Link from "next/link";
import { ArrowLeft, FileSignature, PenTool, Truck } from "lucide-react";

import { Logo } from "@/components/shared/Logo";

import { AuthArtwork } from "./auth-artwork";

import type { ReactNode } from "react";

/** What signing in opens, as short promises under the showcase (kltn-docs 00 §B). */
const PROMISES = [
  { label: "Tự thiết kế 2D, xem trước 3D", icon: PenTool },
  { label: "Báo giá riêng từ Sales", icon: FileSignature },
  { label: "Giao theo đợt, theo dõi từng đơn", icon: Truck },
] as const;

/**
 * The sign-in and activation pages: a light shop-window panel on the left (what the B2B portal sells), the form on the
 * right.
 * Below lg the panel gives way and the logo sits above the form. Outside the shop's header and footer.
 */
export function AuthSplit({ children }: { children: ReactNode }) {
  return (
    <main className="bg-bg-base text-ink-primary min-h-dvh lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(28rem,0.95fr)]">
      <section className="bg-accent text-ink-inverse relative hidden overflow-hidden lg:flex lg:flex-col lg:p-12">
        <AuthArtwork />

        <div className="relative my-auto max-w-xl space-y-5 pb-40">
          <h1 className="font-display text-6xl leading-[0.95] font-bold tracking-tight text-balance">
            Logo của quán, trên từng chiếc ly.
          </h1>
          <p className="text-ink-inverse/80 max-w-[40ch] text-base leading-7">
            Thiết kế ly và bao bì in logo riêng, nhận báo giá sỉ và theo dõi đơn ngay trong cổng khách
            hàng.
          </p>
        </div>

        <ul className="text-ink-inverse/85 relative flex flex-wrap gap-x-6 gap-y-2 text-sm">
          {PROMISES.map(({ label, icon: Icon }) => (
            <li key={label} className="flex items-center gap-2">
              <Icon className="size-4" aria-hidden="true" />
              {label}
            </li>
          ))}
        </ul>
      </section>

      <section className="flex min-h-dvh flex-col px-4 py-6 sm:px-8 lg:px-14 lg:py-10">
        <div className="flex items-center justify-between gap-4">
          <Link
            href="/"
            className="text-ink-secondary hover:text-ink-primary focus-visible:ring-accent -ml-2 inline-flex min-h-11 items-center gap-2 rounded-[var(--r-sm)] px-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Trang chủ
          </Link>
          <Logo height={28} className="lg:hidden" />
        </div>

        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-md">{children}</div>
        </div>
      </section>
    </main>
  );
}
