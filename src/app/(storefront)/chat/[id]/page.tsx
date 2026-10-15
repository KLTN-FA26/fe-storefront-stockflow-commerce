"use client";

import { ChatBubble } from "@/components/storefront/chat-bubble";
import { ChatComposer } from "@/components/storefront/chat-composer";

export default function ChatThreadPage() {
  return (
    <section className="mx-auto flex min-h-[calc(100dvh-var(--header-h)-6rem)] w-full max-w-3xl flex-col gap-4 px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
      <div className="space-y-1">
        <h1 className="font-display text-ink-primary text-2xl font-bold sm:text-3xl">
          Tư vấn thiết kế
        </h1>
        <p className="text-ink-secondary text-sm">
          Internal note được tách nền vàng và không render cho khách.
        </p>
      </div>
      <div className="bg-bg-subtle border-border-default flex-1 space-y-3 rounded-[var(--r-lg)] border p-[var(--card-pad)]">
        <ChatBubble
          author="Sale"
          side="agent"
          message="Mình đã kiểm tra vùng in, logo nên nhỏ hơn 10%."
          timestamp="09:20"
        />
        <ChatBubble
          author="Internal"
          side="agent"
          internal
          message="Khách ưu tiên giao nhanh, kiểm tra tồn size M."
          timestamp="09:21"
        />
        <ChatBubble author="An" message="Bạn chỉnh giúp mình nhé." timestamp="09:23" />
      </div>
      <ChatComposer onSend={() => undefined} />
    </section>
  );
}
