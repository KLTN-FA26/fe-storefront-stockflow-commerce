import type { QueryClient } from "@tanstack/react-query";

import type { FontRegistry } from "../engine";
import { abortable } from "./studio/deadline";
import { loadDesignSession } from "./studio/load-design-session";

/** Longest edge of the 3D picture, in px. */
const DESIGN_3D_PX = 1024;

/**
 * One design drawn on its model, as a PNG: the design is loaded without the studio (its stored
 * document, images and fonts), the model is built offscreen and photographed at its home angle;
 * where WebGL is missing the flat front stands in. Lives apart so the dialog loads it (three.js
 * with it) only when "Xem 3D" is pressed.
 */
export async function renderDesign3D(
  client: QueryClient,
  designId: string,
  fonts: FontRegistry,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  const session = await loadDesignSession(client, designId, fonts, signal ? { signal } : {});
  try {
    // The signal also ends the preview's wait for the model and frees its offscreen viewer.
    return await abortable(session.exportRenderer.preview(DESIGN_3D_PX, signal), signal);
  } finally {
    session.release();
  }
}
