import { Badge } from "@/components/ui/badge";

import type { DesignElement } from "../types";

interface ElementPanelProps {
  elements: DesignElement[];
}

export function ElementPanel({ elements }: ElementPanelProps) {
  return (
    <section className="space-y-3 rounded-xl bg-bg-surface p-[var(--card-pad)] shadow-md">
      <div>
        <h2 className="font-display text-lg font-semibold">Layers</h2>
        <p className="text-sm text-ink-secondary">Danh sách phần tử và thuộc tính in ấn.</p>
      </div>
      <div className="space-y-2">
        {elements.map((element) => (
          <article key={element.id} className="rounded-lg border border-border-default p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold">{element.label}</p>
              <Badge variant={element.outsidePrintArea ? "destructive" : "secondary"}>{element.type}</Badge>
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-2 text-xs text-ink-secondary">
              <div>X: {element.x}%</div><div>Y: {element.y}%</div>
              <div>W: {element.width}%</div><div>H: {element.height}%</div>
            </dl>
          </article>
        ))}
      </div>
    </section>
  );
}
