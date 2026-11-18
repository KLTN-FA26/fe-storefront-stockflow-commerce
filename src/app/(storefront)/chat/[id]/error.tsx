"use client";

import { LoadError } from "@/features/chat/components/chat-states";

export default function ChatThreadError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-5 sm:px-6">
      <LoadError
        title="Không mở được cuộc trò chuyện"
        error={error}
        onRetry={() => reset()}
        backToList
      />
    </div>
  );
}
