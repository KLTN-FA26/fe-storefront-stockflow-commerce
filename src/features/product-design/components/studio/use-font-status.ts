"use client";

import { useEffect, useMemo, useState } from "react";

import { fontCss, type FontRegistry } from "../../engine";
import { useStudio, type FontLoadState } from "./studio-context";

/** Text that pulls in the Vietnamese subset of a face as well as the latin one. */
const SAMPLE_TEXT = "Tiếng Việt";
/** A face that has not loaded by then no longer holds the first paint back (it repaints on arrival). */
const FIRST_PAINT_WAIT_MS = 3000;

/** Size of the font string a face is requested with (any size loads the face). */
const REQUEST_PX = 16;
const STATE_RANK: Record<FontLoadState, number> = { ready: 0, loading: 1, error: 2 };

/** One face of a font: the font string `document.fonts.load` is asked for. */
type Face = { fontCode: string; css: string };

/** The face of `fontCode` in a style the layout asks for (italic only where the family ships it). */
export function faceOf(
  fonts: FontRegistry,
  fontCode: string,
  style: { bold: boolean; italic: boolean },
): Face | undefined {
  const font = fonts[fontCode];
  if (font === undefined) return undefined;
  const css = fontCss(
    { family: font.family, bold: style.bold, italic: style.italic && font.italic },
    REQUEST_PX,
  );
  return { fontCode, css };
}

/** Faces as one `fontCode|css` line each, sorted and without repeats: a stable key to load by. */
export function facesKey(faces: readonly Face[]): string {
  return [...new Set(faces.map(({ fontCode, css }) => `${fontCode}|${css}`))].sort().join("\n");
}

const parseFaces = (key: string): Face[] =>
  key
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [fontCode = "", css = ""] = line.split("|");
      return { fontCode, css };
    });

/** The browser's font set, or `undefined` where there is none (a test DOM, node). */
export const fontSet = () => (typeof document === "undefined" ? undefined : document.fonts);

/**
 * Loads the faces of `key` (`facesKey`) and reports them per font code, for preflight and for the
 * font picker. The one loader of the studio: `useStudioFonts` (the faces the document's text
 * uses) and `useFontStatus` (the faces a picker lists) both read through it.
 *
 * `ready` turns true once the first set has loaded (or failed, or `FIRST_PAINT_WAIT_MS` passed),
 * so text is first drawn in its own font. Without a font loading API nothing is requested, so
 * nothing waits or reports.
 */
export function useFaceStates(key: string) {
  const [supported] = useState(() => fontSet() !== undefined);
  const [ready, setReady] = useState(!supported);
  /** Settled faces by their font string. */
  const [settled, setSettled] = useState<Readonly<Record<string, FontLoadState>>>({});

  useEffect(() => {
    const set = fontSet();
    if (set === undefined) return;
    const settle = (css: string, state: FontLoadState) =>
      setSettled((prev) => (prev[css] === state ? prev : { ...prev, [css]: state }));
    const loads = parseFaces(key).map(({ css }) =>
      set.load(css, SAMPLE_TEXT).then(
        () => settle(css, "ready"),
        () => settle(css, "error"),
      ),
    );
    const timer = setTimeout(() => setReady(true), FIRST_PAINT_WAIT_MS);
    void Promise.all(loads).then(() => setReady(true));
    return () => clearTimeout(timer);
  }, [key]);

  /** A font is as far as its least loaded face: one failed face is an error, one pending is loading. */
  const status = useMemo(() => {
    const byCode: Record<string, FontLoadState> = {};
    if (!supported) return byCode;
    for (const { fontCode, css } of parseFaces(key)) {
      const state = settled[css] ?? "loading";
      const current = byCode[fontCode];
      if (current === undefined || STATE_RANK[state] > STATE_RANK[current])
        byCode[fontCode] = state;
    }
    return byCode;
  }, [key, settled, supported]);

  return { ready, status };
}

/**
 * The load state of the regular face of each font in `codes` (a code the registry lacks is left
 * out), asked of the browser through the studio's one font loader. A font turning `ready` repaints
 * every surface that uses it (`useStudioFonts` listens for `loadingdone`), so a text is never left
 * drawn in the fallback font. Pass `[]` to ask for nothing.
 */
export function useFontStatus(codes: readonly string[]): Readonly<Record<string, FontLoadState>> {
  const { fonts } = useStudio();
  const regular = { bold: false, italic: false };
  const key = facesKey(
    codes.flatMap((code) => {
      const face = faceOf(fonts, code, regular);
      return face ? [face] : [];
    }),
  );
  return useFaceStates(key).status;
}
