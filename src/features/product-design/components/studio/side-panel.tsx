"use client";

import { useState, type ReactNode } from "react";

import { cn } from "@/lib/cn";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { LayersPanel } from "./layers-panel";
import { PropertiesPanel } from "./properties-panel";
import type { PropertySections } from "./property-sections";

type SideTab = "properties" | "layers" | "check";

/** A tab panel takes focus (Tab from its tab): its ring is drawn inside, where the panel scrolls. */
const PANEL =
  "min-h-0 overflow-y-auto focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset";

const TABS: readonly { value: SideTab; label: string }[] = [
  { value: "properties", label: "Thuộc tính" },
  { value: "layers", label: "Lớp" },
  { value: "check", label: "Kiểm tra" },
];

/** What the "Kiểm tra" panel says until it shows the preflight report. */
function CheckPlaceholder() {
  return <p className="text-ink-tertiary text-sm">Chưa có kết quả kiểm tra.</p>;
}

/**
 * The tabs under the preview: "Thuộc tính" (the selection's properties, with the type sections
 * the tools add), "Lớp" (the layers list) and "Kiểm tra" (`check`, the preflight report).
 */
export function SidePanel({
  sections,
  check,
  onEditText,
  className,
}: {
  sections?: PropertySections;
  check?: ReactNode;
  onEditText?: (id: string) => void;
  className?: string;
}) {
  const [tab, setTab] = useState<SideTab>("properties");

  return (
    <section
      aria-label="Thuộc tính và lớp"
      className={cn(
        "bg-bg-surface border-border-default flex min-h-0 flex-col overflow-hidden rounded-[var(--r-lg)] border shadow-[var(--sh-sm)]",
        className,
      )}
    >
      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as SideTab)}
        className="min-h-0 flex-1 gap-0"
      >
        <TabsList
          variant="line"
          className="border-border-default w-full justify-start rounded-none border-b px-2 group-data-horizontal/tabs:h-auto"
        >
          {TABS.map(({ value, label }) => (
            <TabsTrigger
              key={value}
              value={value}
              className="min-h-11 flex-none px-4 text-sm group-data-horizontal/tabs:after:bottom-0"
            >
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="properties" className={cn(PANEL, "p-[var(--card-pad)]")}>
          <PropertiesPanel {...(sections ? { sections } : {})} />
        </TabsContent>
        <TabsContent value="layers" className={cn(PANEL, "p-2")}>
          <LayersPanel {...(onEditText ? { onEditText } : {})} />
        </TabsContent>
        <TabsContent value="check" className={cn(PANEL, "p-[var(--card-pad)]")}>
          {check ?? <CheckPlaceholder />}
        </TabsContent>
      </Tabs>
    </section>
  );
}
