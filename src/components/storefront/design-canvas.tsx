import { CanvasToolbar } from "./canvas-toolbar";

interface CanvasElement {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface DesignCanvasProps {
  elements: CanvasElement[];
  zoom?: number;
}

export function DesignCanvas({ elements, zoom = 100 }: DesignCanvasProps) {
  return (
    <section className="space-y-4 rounded-[var(--r-lg)] border border-border-default bg-bg-surface p-[var(--card-pad)] shadow-[var(--card-shadow)]">
      <CanvasToolbar zoom={zoom} />
      <div className="relative aspect-[4/5] overflow-hidden rounded-[var(--r-lg)] border border-dashed border-border-strong bg-bg-subtle">
        <div className="absolute inset-8 rounded-lg border-2 border-accent/60 bg-bg-surface shadow-inner">
          <span className="absolute left-3 top-3 text-xs font-semibold uppercase tracking-wide text-accent">Print area</span>
          {elements.map((element) => (
            <div key={element.id} className="absolute rounded-md border border-border-default bg-accent/10 p-2 text-xs font-semibold text-accent" style={{ left: `${element.x}%`, top: `${element.y}%`, width: `${element.width}%`, height: `${element.height}%` }}>
              {element.label}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
