import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface ChatBubbleProps {
  author: string;
  message: string;
  timestamp: string;
  side?: "customer" | "agent";
  internal?: boolean;
}

export function ChatBubble({ author, message, timestamp, side = "customer", internal = false }: ChatBubbleProps) {
  const isAgent = side === "agent";
  return (
    <div className={`flex gap-3 ${isAgent ? "justify-start" : "justify-end"}`}>
      {isAgent && <Avatar className="h-8 w-8"><AvatarFallback>{author.slice(0, 1)}</AvatarFallback></Avatar>}
      <div className={`max-w-[80%] rounded-2xl px-4 py-3 shadow-sm ${internal ? "bg-warning/10 text-ink-primary" : isAgent ? "bg-bg-surface" : "bg-accent text-ink-inverse"}`}>
        {internal && <p className="mb-1 text-xs font-semibold text-warning">Internal note</p>}
        <p className="text-sm leading-relaxed">{message}</p>
        <p className={`mt-1 text-xs ${isAgent || internal ? "text-ink-tertiary" : "text-ink-inverse/70"}`}>{timestamp}</p>
      </div>
    </div>
  );
}
