import type { ToolId } from "./controller";

export type ShortcutAction =
  "undo" | "redo" | "delete" | "duplicate" | "raise" | "lower" | "nudge" | "tool";

/** `tool` accompanies `"tool"`; `dx`/`dy` (mm on the surface, +u right, +v down) accompany `"nudge"`. */
export type Shortcut = { action: ShortcutAction; tool?: ToolId; dx?: number; dy?: number };

/** The slice of a `KeyboardEvent` the shortcuts read. */
export type ShortcutKeyEvent = {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
};

const NUDGE_MM = 0.5;
const NUDGE_SHIFT_MM = 5;

const TOOL_KEYS: ReadonlyMap<string, ToolId> = new Map([
  ["v", "select"],
  ["u", "image"],
  ["t", "text"],
  ["b", "brush"],
  ["e", "eraser"],
  ["g", "background"],
]);

/** Arrow key → unit direction on (u, v). */
const ARROW_DIRECTIONS: ReadonlyMap<string, { x: number; y: number }> = new Map([
  ["ArrowLeft", { x: -1, y: 0 }],
  ["ArrowRight", { x: 1, y: 0 }],
  ["ArrowUp", { x: 0, y: -1 }],
  ["ArrowDown", { x: 0, y: 1 }],
]);

/** Ctrl/⌘ + key (lower-case, Shift aside) → action. */
function commandShortcut(key: string, shiftKey: boolean): Shortcut | null {
  switch (key) {
    case "z":
      return { action: shiftKey ? "redo" : "undo" };
    case "y":
      return { action: "redo" };
    case "d":
      return { action: "duplicate" };
    case "]":
      return { action: "raise" };
    case "[":
      return { action: "lower" };
    default:
      return null;
  }
}

/**
 * The editor action a key press stands for, or `null` when it is not ours. Ctrl/⌘ combinations
 * outside the list belong to the browser (Ctrl+T, ⌘+V), so they are never read as tool keys. The
 * caller decides when shortcuts apply (not while typing in a field) and what an action targets.
 */
export function resolveShortcut(e: ShortcutKeyEvent): Shortcut | null {
  if (e.ctrlKey || e.metaKey) return commandShortcut(e.key.toLowerCase(), e.shiftKey);

  if (e.key === "Delete" || e.key === "Backspace") return { action: "delete" };

  const direction = ARROW_DIRECTIONS.get(e.key);
  if (direction) {
    const step = e.shiftKey ? NUDGE_SHIFT_MM : NUDGE_MM;
    return { action: "nudge", dx: direction.x * step, dy: direction.y * step };
  }

  const tool = TOOL_KEYS.get(e.key.toLowerCase());
  return tool ? { action: "tool", tool } : null;
}
