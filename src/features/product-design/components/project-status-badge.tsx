import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import type { SemanticTone } from "@/lib/domain/types";

import type { DesignProject } from "../types";
import { BADGE, TONE_CLASSES } from "./design-status-badge";

/** ACTIVE reads as in progress (info); ARCHIVED as closed (muted), like the status tokens say. */
const META: Record<DesignProject["status"], { label: string; tone: SemanticTone }> = {
  ACTIVE: { label: "Đang dùng", tone: "info" },
  ARCHIVED: { label: "Đã đóng", tone: "muted" },
};

export function ProjectStatusBadge({ status }: { status: DesignProject["status"] }) {
  const { label, tone } = META[status];
  return (
    <Badge data-tone={tone} className={cn(BADGE, TONE_CLASSES[tone])}>
      {label}
    </Badge>
  );
}
