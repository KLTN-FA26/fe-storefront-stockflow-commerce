"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

import type { PrintAreaCode } from "../../engine";
import { BAR_HIT } from "./bar-controls";
import { useEditorState, useStudio } from "./studio-context";

/**
 * The print areas of the template ("Thân ly"; a bag's four faces), in template order, at the end
 * of the context bar. One face is only named; several are a "Mặt in" toggle group whose pressed
 * item is the editor's active surface. Below `xl` the group would not fit beside a text's fixed
 * controls (a bag's four faces take about 340 px of a 1024 px bar), so there it is a "Mặt in" list
 * naming the active face instead. The 3D view turns to the surface on its own when the active
 * surface changes (`ViewerHost`).
 */
export function SurfaceSwitcher() {
  const { editor, surfaces, template } = useStudio();
  const active = useEditorState((s) => s.activeSurface);
  const nameOf = (code: PrintAreaCode) =>
    template.printAreas.find((area) => area.code === code)?.name ?? code;

  if (surfaces.order.length === 1) {
    return (
      <span className="text-ink-primary px-2 text-sm font-medium whitespace-nowrap">
        {nameOf(surfaces.order[0]!)}
      </span>
    );
  }
  const choose = (code: string) => code && editor.setActiveSurface(code as PrintAreaCode);
  return (
    <>
      <ToggleGroup
        type="single"
        aria-label="Mặt in"
        value={active}
        // A press on the pressed face would clear the group: the active surface stays.
        onValueChange={choose}
        variant="outline"
        spacing={1}
        className="max-xl:hidden"
      >
        {surfaces.order.map((code) => (
          <ToggleGroupItem
            key={code}
            value={code}
            className={`h-9 rounded-[var(--r-md)] px-3 whitespace-nowrap ${BAR_HIT}`}
          >
            {nameOf(code)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <Select value={active} onValueChange={choose}>
        <SelectTrigger
          aria-label="Mặt in"
          className={`rounded-[var(--r-md)] data-[size=default]:h-9 xl:hidden ${BAR_HIT}`}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {surfaces.order.map((code) => (
            <SelectItem key={code} value={code} className="min-h-11">
              {nameOf(code)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  );
}
