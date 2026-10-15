import { Progress } from "@/components/ui/progress";

import { SurfaceCard } from "./layout";

interface TrackingProgressProps {
  current: number;
  total: number;
  label: string;
  eta?: string;
}

export function TrackingProgress({ current, total, label, eta }: TrackingProgressProps) {
  const value = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
  return (
    <SurfaceCard as="section" className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold">{label}</h2>
          {eta && <p className="text-ink-secondary text-sm">Dự kiến: {eta}</p>}
        </div>
        <span className="text-accent font-semibold tabular-nums">{value}%</span>
      </div>
      <Progress value={value} />
    </SurfaceCard>
  );
}
