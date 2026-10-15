import { Badge } from "@/components/ui/badge";

import type { DesignElement } from "../types";

interface ElementPanelProps {
  elements: DesignElement[];
}

export function ElementPanel({ elements }: ElementPanelProps) {
  return (
    <section className="space-y-3 bg-bg-surface border border-border-default rounded-[var(--r-lg)] shadow-[var(--card-shadow)] p-[var(--card-pad)]">
      <div>
        <h2 className="font-display text-lg font-semibold text-ink-primary">Layers</h2>
        <p className="text-sm text-ink-secondary">Danh sách phần tử và thuộc tính in ấn.</p>
      </div>
      <div className="space-y-2">
        {elements.map((element) => (
          <article key={element.id} className="rounded-[var(--r-md)] border border-border-default p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="min-w-0 truncate font-semibold text-ink-primary">{element.label}</p>
              <Badge variant={element.outsidePrintArea ? "destructive" : "secondary"}>{element.type}</Badge>
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-ink-secondary tabular-nums">
              <div>X: {element.x}%</div><div>Y: {element.y}%</div>
              <div>W: {element.width}%</div><div>H: {element.height}%</div>
            </dl>
          </article>
        ))}
      </div>
    </section>
  );
}
