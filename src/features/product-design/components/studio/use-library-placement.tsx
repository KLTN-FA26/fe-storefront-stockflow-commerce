"use client";

import { useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

import { describeDesignError, describeFileRefusal } from "../../errors";
import { usePlaceFromLibrary } from "../../library-mutations";
import { placeImage } from "./image-actions";
import { useStudio } from "./studio-context";
import { downloadAsset } from "./use-asset-images";
import { UPLOAD_MESSAGES } from "./use-asset-upload";

const READ_ONLY = "Bản này chỉ để xem, không thêm được ảnh.";
const COPYING = "Đang thêm ảnh từ thư viện…";

export type LibraryPlacement = {
  /**
   * Places an image of the project library on the surface that is active now: the server copies it
   * into the design (A-E2: also from a closed project), the copy goes into the image cache the way
   * an upload does, then `placeImage` adds it, at `at` when given (a drop). Resolves `null` when it
   * was placed, or when nothing was done because another copy is still running; else the words to
   * tell the customer: the variant's rule on a `FILE_RULE` (nothing is placed), a full surface,
   * or the API's refusal. If the customer changes faces during the copy, the element still goes
   * where the click or drop was, and the view follows it.
   */
  place(itemId: string, at?: { u: number; v: number }): Promise<string | null>;
  /** True from the click or drop to the answer: the tiles wait and the stage takes no drop. */
  pending: boolean;
  /**
   * The last refusal of a placement (what `place` resolved with), kept until the next one starts:
   * the Ảnh panel shows it for a click and for a drop alike (spec §6, FILE_RULE).
   */
  refusal: string | null;
  /** Forgets the refusal: it described a placement that is over (another face, another upload). */
  clearRefusal(): void;
};

const LibraryPlacementContext = createContext<LibraryPlacement | null>(null);

/**
 * The studio's one library placement: the Ảnh panel and the stage drop share it, so a second click
 * or drop while a copy runs does nothing (never a second copy or element).
 */
export function LibraryPlacementProvider({ children }: { children: ReactNode }) {
  const services = useStudio();
  const client = useQueryClient();
  const copy = usePlaceFromLibrary(services.design.id);
  const [pending, setPending] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const running = useRef(false);
  const clearRefusal = useCallback(() => setRefusal(null), []);

  const place: LibraryPlacement["place"] = async (itemId, at) => {
    if (running.current) return null;
    setRefusal(null);
    const problem = await run(itemId, at);
    setRefusal(problem);
    return problem;
  };
  const run: LibraryPlacement["place"] = async (itemId, at) => {
    const { editor } = services;
    if (running.current) return null;
    if (editor.store.getState().readOnly) return READ_ONLY;
    running.current = true;
    setPending(true);
    services.announce(COPYING);
    const code = editor.store.getState().activeSurface; // where the click or drop was
    try {
      const asset = await copy.mutateAsync(itemId);
      try {
        const file = await downloadAsset(client, services.design.id, asset.assetId);
        await services.images.load(asset.assetId, file, "proxy");
      } catch {
        // Not an error of the placement: the studio downloads the stored file when it draws.
      }
      if (editor.store.getState().activeSurface !== code) editor.setActiveSurface(code);
      return placeImage(services, asset, at) ? null : UPLOAD_MESSAGES.noRoom;
    } catch (error) {
      return describeFileRefusal(error, services.template) ?? describeDesignError(error);
    } finally {
      running.current = false;
      setPending(false);
    }
  };
  return (
    <LibraryPlacementContext.Provider value={{ place, pending, refusal, clearRefusal }}>
      {children}
    </LibraryPlacementContext.Provider>
  );
}

/** The studio's library placement (`LibraryPlacementProvider`). */
export function useLibraryPlacement(): LibraryPlacement {
  const placement = useContext(LibraryPlacementContext);
  if (!placement)
    throw new Error("useLibraryPlacement must be used inside <LibraryPlacementProvider>");
  return placement;
}
