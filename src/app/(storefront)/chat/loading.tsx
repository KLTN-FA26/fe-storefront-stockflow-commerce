import { ConversationListSkeleton } from "@/features/chat/components/chat-states";

export default function ChatLoading() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
      <ConversationListSkeleton />
    </div>
  );
}
