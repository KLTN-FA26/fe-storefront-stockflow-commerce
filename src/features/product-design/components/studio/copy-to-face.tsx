"use client";

import { Copy } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTrigger,
} from "@/components/ui/popover";

import type { PrintAreaCode } from "../../engine";
import { copyFace } from "./element-actions";
import { STUDIO_ANNOUNCEMENTS } from "./studio-announcer";
import { useEditorState, useStudio } from "./studio-context";

/**
 * "Sao chép sang mặt khác" (a bag's faces): the active face, background and elements, replaces
 * the face picked from the list; every copied element is kept on that face (undo brings the old
 * face back). Nothing for a template with a single print area.
 */
export function CopyToFace() {
  const services = useStudio();
  const { surfaces, template, announce } = services;
  const active = useEditorState((s) => s.activeSurface);
  const readOnly = useEditorState((s) => s.readOnly);
  const empty = useEditorState((s) => {
    const content = s.document.surfaces[s.activeSurface];
    return !content || (content.elements.length === 0 && content.background.kind === "none");
  });
  const [open, setOpen] = useState(false);

  if (surfaces.order.length < 2) return null;
  const nameOf = (code: PrintAreaCode) =>
    template.printAreas.find((area) => area.code === code)?.name ?? code;
  const copyTo = (code: PrintAreaCode) => {
    copyFace(services, active, code);
    announce(STUDIO_ANNOUNCEMENTS.copiedTo(nameOf(code)));
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="min-h-11 w-full rounded-[var(--r-md)]"
          disabled={readOnly || empty}
        >
          <Copy aria-hidden className="mr-1.5 size-4" />
          Sao chép sang mặt khác
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="bg-bg-surface rounded-[var(--r-lg)]">
        <PopoverDescription className="text-ink-secondary">
          Nội dung của {nameOf(active)} sẽ thay cho mặt bạn chọn (có thể hoàn tác).
        </PopoverDescription>
        <div className="flex flex-col gap-1">
          {surfaces.order
            .filter((code) => code !== active)
            .map((code) => (
              <Button
                key={code}
                type="button"
                variant="ghost"
                className="min-h-11 justify-start rounded-[var(--r-md)] px-3"
                onClick={() => copyTo(code)}
              >
                {nameOf(code)}
              </Button>
            ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
