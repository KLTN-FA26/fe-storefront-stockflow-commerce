import Link from "next/link";

import { STORE_ROUTES } from "@/constants";

const conversations = [{ id: "c1", customer: "Nguyễn An", last: "Mình muốn chỉnh logo nhỏ lại", unread: 2 }, { id: "c2", customer: "Lê Bình", last: "Sale đã gửi bản preview", unread: 0 }];

export default function ChatPage() {
  return (
    <section className="mx-auto w-full max-w-3xl space-y-4 px-4 py-8 sm:px-6 lg:px-8">
      <div><h1 className="font-display text-3xl font-bold">Sales Chat</h1><p className="text-ink-secondary">Kênh hỗ trợ khách tinh chỉnh thiết kế.</p></div>
      {conversations.map((item) => (
        <Link key={item.id} href={STORE_ROUTES.chat.detail(item.id)} className="block rounded-xl bg-bg-surface p-[var(--card-pad)] shadow-md transition hover:shadow-lg">
          <div className="flex items-center justify-between gap-3"><h2 className="font-semibold">{item.customer}</h2>{item.unread > 0 && <span className="rounded-full bg-accent px-2 py-0.5 text-xs text-ink-inverse">{item.unread}</span>}</div>
          <p className="mt-2 text-sm text-ink-secondary">{item.last}</p>
        </Link>
      ))}
    </section>
  );
}
