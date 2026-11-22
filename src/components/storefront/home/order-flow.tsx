import Link from "next/link";
import { ArrowRight, FileSignature, FileText, MessageCircle, Palette } from "lucide-react";

import { STORE_ROUTES } from "@/constants";
import { cn } from "@/lib/cn";

import { SurfaceCard } from "@/components/storefront/layout";
import { CHAT_WITH_SALES, ORDER_FLOW_ANCHOR } from "@/components/storefront/shell/nav-config";

const cta =
  "focus-visible:ring-accent focus-visible:ring-offset-bg-surface inline-flex min-h-11 items-center gap-2 rounded-[var(--r-md)] px-5 text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none";

/**
 * How a wholesale customer orders (WF-02): a design approved for print, a quote by the carton from
 * Sales, then a contract whose installments are paid by transfer. There is no cart and no checkout.
 */
export const ORDER_FLOW_STEPS = [
  {
    title: "Thiết kế & gửi duyệt",
    desc: "Đặt logo lên mẫu, kiểm tra file in rồi gửi duyệt.",
    icon: Palette,
  },
  {
    title: "Nhận báo giá",
    desc: "Sale báo giá theo số thùng. Bạn chấp nhận hoặc đề nghị sửa.",
    icon: FileText,
  },
  {
    title: "Ký hợp đồng & thanh toán theo đợt",
    desc: "Chuyển khoản từng đợt theo hợp đồng, hàng giao nguyên chuyến.",
    icon: FileSignature,
  },
] as const;

export function OrderFlow() {
  return (
    <section
      id={ORDER_FLOW_ANCHOR}
      aria-labelledby="order-flow-title"
      className="scroll-mt-[var(--sticky-top)]"
    >
      <SurfaceCard className="grid gap-5 lg:grid-cols-[2fr_3fr] lg:items-center lg:gap-8">
        <div className="space-y-2">
          <h2
            id="order-flow-title"
            className="font-display text-ink-primary text-xl font-bold sm:text-2xl"
          >
            Đặt in trong 3 bước
          </h2>
          <p className="text-ink-secondary text-sm">
            Từ thiết kế được duyệt đến báo giá và hợp đồng. Sale theo sát bạn qua chat ở mỗi bước.
          </p>
          <div className="flex flex-wrap gap-2 pt-2">
            <Link
              href={STORE_ROUTES.design.list}
              className={cn(cta, "bg-brand text-ink-inverse hover:bg-brand-hover")}
            >
              Bắt đầu thiết kế
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
            <Link
              href={STORE_ROUTES.chat.list}
              className={cn(
                cta,
                "border-border-default text-ink-primary hover:bg-bg-muted border bg-transparent",
              )}
            >
              <MessageCircle className="size-4" aria-hidden="true" />
              {CHAT_WITH_SALES}
            </Link>
          </div>
        </div>
        <ol className="grid gap-3 sm:grid-cols-3">
          {ORDER_FLOW_STEPS.map(({ title, desc, icon: Icon }, index) => (
            <li
              key={title}
              className="bg-bg-subtle border-border-default flex items-start gap-3 rounded-[var(--r-md)] border p-3 sm:flex-col"
            >
              <span className="bg-accent text-ink-inverse flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold tabular-nums">
                {index + 1}
              </span>
              <span className="min-w-0 flex-1 space-y-1 sm:w-full">
                <span className="flex items-center justify-between gap-2">
                  <span className="text-ink-primary text-sm font-semibold">{title}</span>
                  <Icon className="text-ink-tertiary size-5 shrink-0" aria-hidden="true" />
                </span>
                <span className="text-ink-secondary block text-xs">{desc}</span>
              </span>
            </li>
          ))}
        </ol>
      </SurfaceCard>
    </section>
  );
}
