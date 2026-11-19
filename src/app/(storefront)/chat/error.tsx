"use client";

import { LoadError } from "@/features/chat/components/chat-states";

export default function ChatError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
      <LoadError title="Không hiển thị được trang chat" error={error} onRetry={() => reset()} />
    </div>
  );
}
