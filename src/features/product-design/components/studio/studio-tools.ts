import {
  Brush,
  Eraser,
  ImagePlus,
  MousePointer2,
  PaintBucket,
  Type,
  type LucideIcon,
} from "lucide-react";

import type { ToolId } from "../../engine";

/**
 * The studio's tools with their shortcut keys (spec §6.2), in rail order. `label` carries the
 * shortcut (accessible name and tooltip); `short` is what the rail and the panel show.
 */
export const STUDIO_TOOLS: readonly {
  id: ToolId;
  label: string;
  short: string;
  icon: LucideIcon;
}[] = [
  { id: "select", label: "Chọn (V)", short: "Chọn", icon: MousePointer2 },
  { id: "image", label: "Ảnh/Logo (U)", short: "Ảnh", icon: ImagePlus },
  { id: "text", label: "Chữ (T)", short: "Chữ", icon: Type },
  { id: "brush", label: "Vẽ (B)", short: "Vẽ", icon: Brush },
  { id: "eraser", label: "Tẩy (E)", short: "Tẩy", icon: Eraser },
  { id: "background", label: "Nền (G)", short: "Nền", icon: PaintBucket },
];
