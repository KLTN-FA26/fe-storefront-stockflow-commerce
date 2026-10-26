"use client";

import type { ReactNode } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import type { PrintAreaCode } from "../../engine";
import { useEditorState, useStudio } from "./studio-context";

/**
 * One tab per print area of the template ("Thân ly"; a bag's four faces), in template order. The
 * active tab is the editor's active surface; `children` (the stage) is its panel. The 3D view turns
 * to the surface on its own when the active surface changes (`ViewerHost`).
 */
export function SurfaceTabs({ children }: { children: ReactNode }) {
  const { editor, surfaces, template } = useStudio();
  const active = useEditorState((s) => s.activeSurface);
  const nameOf = (code: PrintAreaCode) =>
    template.printAreas.find((area) => area.code === code)?.name ?? code;

  return (
    <Tabs
      value={active}
      onValueChange={(value) => editor.setActiveSurface(value as PrintAreaCode)}
      className="min-h-0 flex-1 gap-0"
    >
      <TabsList
        variant="line"
        aria-label="Mặt in"
        className="border-border-default w-full justify-start overflow-x-auto rounded-none border-b px-2 group-data-horizontal/tabs:h-auto"
      >
        {surfaces.order.map((code) => (
          <TabsTrigger
            key={code}
            value={code}
            className="min-h-11 flex-none px-4 text-sm group-data-horizontal/tabs:after:bottom-0"
          >
            {nameOf(code)}
          </TabsTrigger>
        ))}
      </TabsList>
      {/* Not a tab stop of its own: the stage inside it is. */}
      <TabsContent value={active} tabIndex={-1} className="flex min-h-0 flex-col">
        {children}
      </TabsContent>
    </Tabs>
  );
}
