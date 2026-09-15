import { Progress } from "@/components/ui/progress";

interface TrackingProgressProps {
  current: number;
  total: number;
  label: string;
  eta?: string;
}

export function TrackingProgress({ current, total, label, eta }: TrackingProgressProps) {
  const value = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
  return (
    <section className="space-y-3 rounded-xl bg-bg-surface p-[var(--card-pad)] shadow-md">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold">{label}</h2>
          {eta && <p className="text-sm text-ink-secondary">Dự kiến: {eta}</p>}
        </div>
        <span className="font-semibold tabular-nums text-accent">{value}%</span>
      </div>
      <Progress value={value} />
    </section>
  );
}
