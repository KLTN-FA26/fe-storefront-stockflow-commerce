import { ChatThreadScreen } from "@/features/chat";

export default async function ChatThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Keyed by id: C9 may continue the conversation in a new one, whose page starts fresh.
  return <ChatThreadScreen key={id} conversationId={id} />;
}
