"use client";

import { Layers } from "lucide-react";

import { Button } from "@/components/ui/button";
import { RadioGroup } from "@/components/ui/radio-group";

import { isKraft, type Background, type EditorState } from "../../engine";
import {
  applyBackground,
  applyBackgroundToAll,
  backgroundOfKind,
  isBackgroundKind,
  NO_BACKGROUND,
  type BackgroundKind,
} from "./background-actions";
import { ColorField } from "./color-field";
import { PatternOptions } from "./pattern-options";
import { RadioCard } from "./radio-card";
import { STUDIO_ANNOUNCEMENTS } from "./studio-announcer";
import { useEditorState, useStudio } from "./studio-context";

const KINDS: readonly { kind: BackgroundKind; label: string }[] = [
  { kind: "none", label: "Không nền" },
  { kind: "color", label: "Màu" },
  { kind: "pattern", label: "Hoạ tiết" },
];

/** The active surface's background (a stable reference for `useEditorState`). */
const activeBackground = (s: EditorState): Background =>
  s.document.surfaces[s.activeSurface]?.background ?? NO_BACKGROUND;

/**
 * The Nền tool's options for the active surface: none, one colour, or a pattern (its own options,
 * `PatternOptions`). A bag, with several faces, can copy the background to all of them ("Áp dụng
 * cho mọi mặt", one undo step). On kraft stock a near-white colour is warned about.
 */
export function BackgroundToolPanel() {
  const { editor, surfaces, template, announce } = useStudio();
  const code = useEditorState((s) => s.activeSurface);
  const readOnly = useEditorState((s) => s.readOnly);
  const background = useEditorState(activeBackground);
  const kraft = isKraft(template);
  const set = (next: Background, session?: string) => applyBackground(editor, code, next, session);

  return (
    <div className="flex flex-col gap-4">
      <RadioGroup
        aria-label="Kiểu nền"
        value={background.kind}
        disabled={readOnly}
        onValueChange={(kind) => {
          if (isBackgroundKind(kind)) set(backgroundOfKind(kind, background));
        }}
        className="gap-2"
      >
        {KINDS.map(({ kind, label }) => (
          <RadioCard
            key={kind}
            value={kind}
            chosen={kind === background.kind}
            className="flex px-3"
          >
            <span className="text-ink-primary text-sm font-medium">{label}</span>
          </RadioCard>
        ))}
      </RadioGroup>
      {background.kind === "color" ? (
        <ColorField
          label="Màu nền"
          value={background.color}
          onChange={(color) => set({ kind: "color", color })}
          warnOnKraft={kraft}
        />
      ) : null}
      {background.kind === "pattern" ? (
        <PatternOptions background={background} kraft={kraft} readOnly={readOnly} onChange={set} />
      ) : null}
      {surfaces.order.length > 1 ? (
        <Button
          type="button"
          variant="outline"
          className="min-h-11 justify-start rounded-[var(--r-md)] px-3"
          disabled={readOnly}
          onClick={() => {
            applyBackgroundToAll(editor, background);
            announce(STUDIO_ANNOUNCEMENTS.backgroundAppliedToAll);
          }}
        >
          <Layers aria-hidden className="mr-1.5 size-4" />
          Áp dụng cho mọi mặt
        </Button>
      ) : null}
    </div>
  );
}
