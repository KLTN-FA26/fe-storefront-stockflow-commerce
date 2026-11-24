import { Check, FileSignature, FileText, MousePointer2 } from "lucide-react";

/**
 * What the customer holds at each step of an order, drawn as small screens of the portal: the print file in the
 * studio, the quote, the contract. Illustrative only (sample figures, no real data), and hidden from assistive
 * technology: the step's title and text say it.
 */

/** The tinted stage each screen floats on. */
const stage =
  "bg-accent/5 relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-[var(--r-lg)] p-4";
/** The floating screen. */
const screen =
  "bg-bg-surface border-border-default w-full max-w-[17rem] overflow-hidden rounded-[var(--r-md)] border shadow-[var(--sh-md)]";
const tiny = "text-[0.6875rem] leading-4";

/** A screen's title bar: an icon and a name, as the portal's own headers. */
function TitleBar({ icon: Icon, title }: { icon: typeof FileText; title: string }) {
  return (
    <div className="border-border-default flex items-center gap-1.5 border-b px-2.5 py-1.5">
      <Icon className="text-accent size-3" />
      <span className={`text-ink-primary font-semibold ${tiny}`}>{title}</span>
    </div>
  );
}

/** Step 1: the studio, the logo selected on the flat cup wrap, the print check passed. */
function PrintFileArt() {
  return (
    <div className={stage}>
      <div className={screen}>
        <TitleBar icon={FileText} title="Thiết kế 2D" />
        <div className="bg-bg-subtle relative px-4 py-1.5">
          <svg viewBox="8 8 184 92" className="w-full">
            <path
              d="M14 14 A150 150 0 0 0 186 14 L170 96 A110 110 0 0 1 30 96 Z"
              className="fill-bg-surface stroke-border-strong"
              strokeWidth="1.2"
            />
            <path
              d="M24 22 A140 140 0 0 0 176 22 L162 88 A100 100 0 0 1 38 88 Z"
              fill="none"
              className="stroke-accent"
              strokeOpacity="0.45"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
            <circle cx="100" cy="58" r="17" className="fill-accent" />
            <circle cx="100" cy="58" r="7" className="fill-bg-surface" />
            <rect x="78" y="36" width="44" height="44" fill="none" className="stroke-accent" strokeWidth="1" />
            {(
              [
                [78, 36],
                [122, 36],
                [78, 80],
                [122, 80],
              ] as const
            ).map(([x, y]) => (
              <rect key={`${x}-${y}`} x={x - 2.5} y={y - 2.5} width="5" height="5" className="fill-bg-surface stroke-accent" strokeWidth="1" />
            ))}
          </svg>
          <MousePointer2 className="fill-ink-primary text-ink-primary absolute right-[28%] bottom-[18%] size-3.5" />
        </div>
        <div className="flex items-center justify-between px-2.5 py-1.5">
          <span className={`text-ink-tertiary ${tiny}`}>Kiểm tra file in</span>
          <span className={`bg-positive/10 text-positive inline-flex items-center gap-0.5 rounded-full px-1.5 font-semibold ${tiny}`}>
            <Check className="size-3" />
            Đạt
          </span>
        </div>
      </div>
    </div>
  );
}

/** Step 2: the quote, by the carton, waiting for the customer's answer. */
function QuoteArt() {
  return (
    <div className={stage}>
      <div className={screen}>
        <TitleBar icon={FileText} title="Báo giá" />
        <div className="space-y-2 px-2.5 py-2">
          <div className="flex items-center gap-2">
            <span className="bg-bg-subtle flex size-8 shrink-0 items-center justify-center rounded-[var(--r-sm)]">
              <svg viewBox="0 0 24 24" className="size-5">
                <path d="M6 5 L18 5 L16.5 21 L7.5 21 Z" className="fill-bg-surface stroke-border-strong" strokeWidth="1" />
                <circle cx="12" cy="12.5" r="2.6" className="fill-accent" />
              </svg>
            </span>
            <div className="min-w-0 flex-1">
              <p className={`text-ink-primary truncate font-medium ${tiny}`}>Ly giấy 12oz</p>
              <p className={`text-ink-tertiary ${tiny}`}>1.000 ly / thùng</p>
            </div>
            <span className={`text-ink-primary font-semibold tabular-nums ${tiny}`}>120 thùng</span>
          </div>
          <div className="border-border-default space-y-1 border-t pt-1.5">
            <div className="flex justify-between">
              <span className={`text-ink-tertiary ${tiny}`}>Tạm tính</span>
              <span className="bg-bg-muted my-auto h-1.5 w-12 rounded-full" />
            </div>
            <div className="flex justify-between">
              <span className={`text-ink-tertiary ${tiny}`}>VAT</span>
              <span className="bg-bg-muted my-auto h-1.5 w-8 rounded-full" />
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <span className={`bg-accent text-ink-inverse flex-1 rounded-[var(--r-sm)] py-1 text-center font-semibold ${tiny}`}>
              Chấp nhận
            </span>
            <span className={`border-border-default text-ink-secondary flex-1 rounded-[var(--r-sm)] border py-1 text-center ${tiny}`}>
              Đề nghị sửa
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Step 3: the signed contract and its installments, two paid, one to come. */
function ContractArt() {
  const installments = [
    { label: "Đợt 1", paid: true },
    { label: "Đợt 2", paid: true },
    { label: "Đợt 3", paid: false },
  ];
  return (
    <div className={stage}>
      <div className={screen}>
        <TitleBar icon={FileSignature} title="Hợp đồng mua bán" />
        <div className="space-y-2.5 px-2.5 py-2">
          <div className="flex items-end justify-between">
            <svg viewBox="0 0 80 22" className="text-ink-primary h-5 w-20">
              <path
                d="M2 16 C9 3 13 19 21 10 S33 3 39 13 S53 15 59 7 L72 9"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
            <span className={`bg-positive/10 text-positive inline-flex items-center gap-0.5 rounded-full px-1.5 font-semibold ${tiny}`}>
              <Check className="size-3" />
              Đã ký
            </span>
          </div>
          <ol className="border-border-default space-y-1 border-t pt-2">
            {installments.map(({ label, paid }) => (
              <li key={label} className="flex items-center gap-2">
                <span
                  className={`flex size-3.5 shrink-0 items-center justify-center rounded-full ${paid ? "bg-positive text-ink-inverse" : "border-border-strong border"}`}
                >
                  {paid ? <Check className="size-2.5" strokeWidth={3} /> : null}
                </span>
                <span className={`text-ink-secondary flex-1 ${tiny}`}>{label}</span>
                <span className={`${paid ? "text-positive" : "text-ink-tertiary"} ${tiny}`}>
                  {paid ? "Đã thanh toán" : "Sắp tới hạn"}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}

export const ORDER_FLOW_ART = [PrintFileArt, QuoteArt, ContractArt] as const;
