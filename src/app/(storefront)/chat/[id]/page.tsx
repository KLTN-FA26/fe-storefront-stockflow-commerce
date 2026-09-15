"use client";

import { ChatBubble } from "@/components/storefront/chat-bubble";
import { ChatComposer } from "@/components/storefront/chat-composer";

export default function ChatThreadPage() {
  return (
    <section className="mx-auto flex min-h-[calc(100vh-8rem)] w-full max-w-3xl flex-col gap-4 px-4 py-8 sm:px-6 lg:px-8">
      <div><h1 className="font-display text-3xl font-bold">Tư vấn thiết kế</h1><p className="text-sm text-ink-secondary">Internal note được tách nền vàng và không render cho khách.</p></div>
      <div className="flex-1 space-y-4 rounded-xl bg-bg-subtle p-4"><ChatBubble author="Sale" side="agent" message="Mình đã kiểm tra vùng in, logo nên nhỏ hơn 10%." timestamp="09:20" /><ChatBubble author="Internal" side="agent" internal message="Khách ưu tiên giao nhanh, kiểm tra tồn size M." timestamp="09:21" /><ChatBubble author="An" message="Bạn chỉnh giúp mình nhé." timestamp="09:23" /></div>
      <ChatComposer onSend={() => undefined} />
    </section>
  );
}
