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
    <ol className="space-y-4 rounded-xl bg-bg-surface p-[var(--card-pad)] shadow-md">
      {items.map((item) => (
        <li key={item.id} className="flex gap-3">
          {item.completed ? <CheckCircle2 className="mt-0.5 h-5 w-5 text-positive" /> : <Circle className="mt-0.5 h-5 w-5 text-ink-tertiary" />}
          <div>
            <p className="font-semibold text-ink-primary">{item.label}</p>
            {item.description && <p className="text-sm text-ink-secondary">{item.description}</p>}
            {item.time && <time className="text-xs text-ink-tertiary">{item.time}</time>}
          </div>
        </li>
      ))}
    </ol>
  );
}
