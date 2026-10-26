"use client";

import { useEffect } from "react";
import { useStore } from "zustand";

import {
  printAreaCodeSchema,
  type DesignDocument,
  type EditorController,
  type FontRegistry,
  type SurfaceSet,
} from "../../engine";
import type { RepaintChannel } from "./studio-context";
import { faceOf, facesKey, fontSet, useFaceStates } from "./use-font-status";

/**
 * The faces the document's text uses, as `facesKey` lists them. The style is the one the layout
 * asks for (italic only where the family ships it).
 */
function documentFacesKey(document: DesignDocument, fonts: FontRegistry): string {
  const faces = [];
  for (const code of printAreaCodeSchema.options) {
    for (const el of document.surfaces[code]?.elements ?? []) {
      const face = el.type === "text" ? faceOf(fonts, el.fontCode, el) : undefined;
      if (face) faces.push(face);
    }
  }
  return facesKey(faces);
}

/**
 * Loads the faces the document's text uses (the studio's fonts are not preloaded; `useFaceStates`
 * does it) and reports them per font code for preflight. `ready` is true once the first set has
 * settled, so text is first drawn in its own font; any later face arriving (`loadingdone`) repaints
 * every surface, since text may then measure differently.
 */
export function useStudioFonts({
  fonts,
  editor,
  surfaces,
  repaint,
}: {
  fonts: FontRegistry;
  editor: EditorController;
  surfaces: SurfaceSet;
  repaint: RepaintChannel;
}) {
  const key = useStore(editor.store, (state) => documentFacesKey(state.document, fonts));
  const { ready, status } = useFaceStates(key);

  useEffect(() => {
    const set = fontSet();
    if (set === undefined) return;
    const onLoaded = () => repaint.request(surfaces.order);
    set.addEventListener("loadingdone", onLoaded);
    return () => set.removeEventListener("loadingdone", onLoaded);
  }, [repaint, surfaces]);

  return { ready, status };
}
