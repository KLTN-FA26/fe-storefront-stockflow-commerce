import { ORDER_FLOW_ANCHOR } from "@/components/storefront/shell/nav-config";

import { ORDER_FLOW_ART } from "./order-flow-art";

/**
 * How a wholesale customer orders (WF-02): a design approved for print, a quote by the carton from
 * Sales, then a contract whose installments are paid by transfer. There is no cart and no checkout.
 */
export const ORDER_FLOW_STEPS = [
  {
    title: "Thiết kế và gửi duyệt",
    desc: "Đặt logo lên mẫu, kiểm tra file in rồi gửi duyệt.",
  },
  {
    title: "Nhận báo giá",
    desc: "Sale báo giá theo số thùng. Bạn chấp nhận hoặc đề nghị sửa.",
  },
  {
    title: "Ký hợp đồng, thanh toán theo đợt",
    desc: "Chuyển khoản từng đợt theo hợp đồng, hàng giao theo lịch đã chốt.",
  },
] as const;

/**
 * The three steps on one tinted band: the heading and its line above, then each step shows
 * what the customer holds at that point (print file, quote, contract) above its number and text. Numbered and joined
 * because they are a sequence. Stacked on phones.
 */
export function OrderFlow() {
  return (
    <section
      id={ORDER_FLOW_ANCHOR}
      aria-labelledby="order-flow-title"
      className="bg-bg-subtle scroll-mt-[var(--sticky-top)] space-y-8 rounded-[var(--r-xl)] p-5 sm:p-8 lg:p-10"
    >
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between md:gap-10">
        <h2
          id="order-flow-title"
          className="font-display text-ink-primary text-2xl font-bold tracking-tight sm:text-3xl"
        >
          Đặt in trong 3 bước
        </h2>
        <p className="text-ink-secondary max-w-[46ch] text-sm leading-6 md:text-right">
          Không có giỏ hàng: mỗi đơn đi từ thiết kế được duyệt tới báo giá và hợp đồng. Sale theo
          sát bạn qua chat.
        </p>
      </div>

      <ol className="grid gap-6 sm:grid-cols-3 sm:gap-5">
        {ORDER_FLOW_STEPS.map(({ title, desc }, index) => {
          const Art = ORDER_FLOW_ART[index];
          const last = index === ORDER_FLOW_STEPS.length - 1;
          return (
            <li key={title} className="space-y-4">
              <div aria-hidden="true">{Art ? <Art /> : null}</div>
              <div className="flex items-center gap-3" aria-hidden="true">
                <span className="bg-accent text-ink-inverse flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold tabular-nums">
                  {index + 1}
                </span>
                {last ? null : (
                  <span className="border-border-strong hidden flex-1 border-t border-dashed sm:block" />
                )}
              </div>
              <div className="space-y-1">
                <h3 className="text-ink-primary text-base font-semibold">
                  <span className="sr-only">Bước {index + 1}: </span>
                  {title}
                </h3>
                <p className="text-ink-secondary text-sm leading-6">{desc}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
