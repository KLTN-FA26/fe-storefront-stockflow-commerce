import { Badge } from "@/components/ui/badge";

import type { DesignElement } from "../types";

interface ElementPanelProps {
  elements: DesignElement[];
}

export function ElementPanel({ elements }: ElementPanelProps) {
  return (
    <section className="bg-bg-surface border-border-default space-y-3 rounded-[var(--r-lg)] border p-[var(--card-pad)] shadow-[var(--card-shadow)]">
      <div>
        <h2 className="font-display text-ink-primary text-lg font-semibold">Layers</h2>
        <p className="text-ink-secondary text-sm">Danh sách phần tử và thuộc tính in ấn.</p>
      </div>
      <div className="space-y-2">
        {elements.map((element) => (
          <article
            key={element.id}
            className="border-border-default rounded-[var(--r-md)] border p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-ink-primary min-w-0 truncate font-semibold">{element.label}</p>
              <Badge variant={element.outsidePrintArea ? "destructive" : "secondary"}>
                {element.type}
              </Badge>
            </div>
            <dl className="text-ink-secondary mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs tabular-nums">
              <div>X: {element.x}%</div>
              <div>Y: {element.y}%</div>
              <div>W: {element.width}%</div>
              <div>H: {element.height}%</div>
            </dl>
          </article>
        ))}
      </div>
    </section>
  );
}
