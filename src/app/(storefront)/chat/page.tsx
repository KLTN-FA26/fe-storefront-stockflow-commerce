import Link from "next/link";
import { Clock } from "lucide-react";

import { STORE_ROUTES } from "@/constants";

import { PageShell, SurfaceCard } from "@/components/storefront/layout";

const conversations = [
  { id: "c1", customer: "Nguyễn An", last: "Mình muốn chỉnh logo nhỏ lại", unread: 2 },
  { id: "c2", customer: "Lê Bình", last: "Sale đã gửi bản preview", unread: 0 },
];

export default function ChatPage() {
  return (
    <PageShell width="narrow" title="Sales Chat" subtitle="Kênh hỗ trợ khách tinh chỉnh thiết kế.">
      <div className="space-y-3">
        <p className="text-ink-secondary flex items-center gap-2 text-sm">
          <Clock aria-hidden className="text-accent size-4 shrink-0" />
          Phản hồi trong ~15 phút giờ hành chính
        </p>
        <SurfaceCard padded={false} className="divide-border-default divide-y overflow-hidden">
          {conversations.map((item) => (
            <Link
              key={item.id}
              href={STORE_ROUTES.chat.detail(item.id)}
              className="hover:bg-bg-muted focus-visible:ring-accent flex min-h-16 items-center gap-3 px-[var(--card-pad)] py-3 transition-colors focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset"
            >
              <span
                aria-hidden
                className="bg-accent/10 text-accent flex size-11 shrink-0 items-center justify-center rounded-full text-base font-semibold"
              >
                {item.customer.slice(0, 1)}
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-ink-primary truncate font-semibold">{item.customer}</h2>
                <p className="text-ink-secondary truncate text-sm">{item.last}</p>
              </div>
              {item.unread > 0 && (
                <span className="bg-accent text-ink-inverse shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums">
                  {item.unread}
                </span>
              )}
            </Link>
          ))}
        </SurfaceCard>
      </div>
    </PageShell>
  );
}
