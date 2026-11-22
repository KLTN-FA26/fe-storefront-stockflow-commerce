"use client";

import { EmptyState } from "@/components/shared";

import type { Design } from "../types";
import { COLOR_DISCLAIMER } from "./color-disclaimer";
import { ProjectDesignCard } from "./project-design-card";

type Props = {
  designs: readonly Design[];
  projectId: string;
  open: boolean;
  chosen: ReadonlySet<string>;
  onChoose: (design: Design, checked: boolean) => void;
  onView3D: (design: Design) => void;
  onClone: (design: Design) => void;
};

/** The project's designs side by side: one column on a phone, two from `sm`, three from `lg`. */
export function ProjectDesigns({
  designs,
  projectId,
  open,
  chosen,
  onChoose,
  onView3D,
  onClone,
}: Props) {
  if (designs.length === 0) {
    return (
      <EmptyState
        title="Dự án chưa có bản thiết kế nào"
        description={
          open
            ? "Tạo bản mới trong dự án, hoặc thêm một bản bạn đã làm."
            : "Dự án này đã đóng và không có bản nào."
        }
      />
    );
  }
  return (
    <div className="space-y-3">
      <p className="text-ink-tertiary text-xs">{COLOR_DISCLAIMER}</p>
      <ul
        aria-label="Các bản trong dự án"
        className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3"
      >
        {designs.map((design) => (
          <li key={design.id}>
            <ProjectDesignCard
              design={design}
              projectId={projectId}
              open={open}
              checked={chosen.has(design.id)}
              onCheckedChange={onChoose}
              onView3D={onView3D}
              onClone={onClone}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
