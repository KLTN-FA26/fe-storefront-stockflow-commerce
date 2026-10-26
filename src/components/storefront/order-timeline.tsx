import { CheckCircle2, Circle } from "lucide-react";

interface TimelineItem {
  id: string;
  label: string;
  time?: string;
  completed?: boolean;
  description?: string;
}

interface OrderTimelineProps {
  items: TimelineItem[];
}

export function OrderTimeline({ items }: OrderTimelineProps) {
  return (
    <ol className="border-border-default bg-bg-surface space-y-4 rounded-[var(--r-lg)] border p-[var(--card-pad)] shadow-[var(--card-shadow)]">
      {items.map((item) => (
        <li key={item.id} className="flex gap-3">
          {item.completed ? (
            <CheckCircle2 className="text-positive mt-0.5 h-5 w-5" />
          ) : (
            <Circle className="text-ink-tertiary mt-0.5 h-5 w-5" />
          )}
          <div>
            <p className="text-ink-primary font-semibold">{item.label}</p>
            {item.description && <p className="text-ink-secondary text-sm">{item.description}</p>}
            {item.time && <time className="text-ink-tertiary text-xs">{item.time}</time>}
          </div>
        </li>
      ))}
    </ol>
  );
}
