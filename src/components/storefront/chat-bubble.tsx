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
      {isAgent && <Avatar className="size-8 shrink-0"><AvatarFallback>{author.slice(0, 1)}</AvatarFallback></Avatar>}
      <div className={`max-w-[85%] min-w-0 rounded-[var(--r-lg)] px-3.5 py-2.5 shadow-[var(--card-shadow)] sm:max-w-[80%] ${internal ? "border border-warning/40 bg-warning/10 text-ink-primary" : isAgent ? "border border-border-default bg-bg-surface text-ink-primary" : "bg-accent text-ink-inverse"}`}>
        {internal && <p className="mb-1 text-xs font-semibold text-warning">Internal note</p>}
        <p className="text-sm leading-relaxed break-words">{message}</p>
        <p className={`mt-1 text-xs tabular-nums ${isAgent || internal ? "text-ink-tertiary" : "text-ink-inverse/70"}`}>{timestamp}</p>
      </div>
    </div>
  );
}
