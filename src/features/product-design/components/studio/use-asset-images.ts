"use client";

import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { useStore } from "zustand";

import {
  printAreaCodeSchema,
  type DesignDocument,
  type EditorController,
  type ImageCache,
  type IsPinned,
  type PreflightAsset,
} from "../../engine";
import { downloadLinkQuery } from "../../queries";
import type { DesignAsset } from "../../types";
import type { RepaintChannel } from "./studio-context";

type Options = {
  designId: string;
  editor: EditorController;
  /** The design's stored images (P4) by asset id. */
  assets: ReadonlyMap<string, DesignAsset>;
  images: ImageCache;
  repaint: RepaintChannel;
};

/** The ids of the images the document places. */
function documentAssetIds(document: DesignDocument): Set<string> {
  const ids = new Set<string>();
  for (const code of printAreaCodeSchema.options) {
    for (const el of document.surfaces[code]?.elements ?? []) {
      if (el.type === "image") ids.add(el.assetId);
    }
  }
  return ids;
}

/** The same ids sorted and space-joined: one string per set, for a selector. */
const assetIdsKey = (document: DesignDocument) => [...documentAssetIds(document)].sort().join(" ");

/** The image elements of the document that place `assetId`. */
function placementsOf(document: DesignDocument, assetId: string): Set<string> {
  const ids = new Set<string>();
  for (const code of printAreaCodeSchema.options) {
    for (const el of document.surfaces[code]?.elements ?? []) {
      if (el.type === "image" && el.assetId === assetId) ids.add(el.id);
    }
  }
  return ids;
}

/** Every image element as `elementId=assetId`, sorted and space-joined, for a selector. */
const placementsKey = (document: DesignDocument) =>
  printAreaCodeSchema.options
    .flatMap((code) =>
      (document.surfaces[code]?.elements ?? []).flatMap((el) =>
        el.type === "image" ? [`${el.id}=${el.assetId}`] : [],
      ),
    )
    .sort()
    .join(" ");

/** Asset id → the image elements that placed it when its load failed. */
type Failures = ReadonlyMap<string, ReadonlySet<string>>;

/**
 * The assets that stay failed: those whose every element now was already there when the load
 * failed. An image placed again (a new element) is tried once more.
 */
function stillFailed(failures: Failures, placements: string): Set<string> {
  const now = new Map<string, Set<string>>();
  for (const pair of placements.split(" ")) {
    const [elementId, assetId] = pair.split("=");
    if (!elementId || !assetId) continue;
    const ids = now.get(assetId) ?? new Set<string>();
    ids.add(elementId);
    now.set(assetId, ids);
  }
  const failed = new Set<string>();
  for (const [assetId, before] of failures) {
    if ([...(now.get(assetId) ?? [])].every((id) => before.has(id))) failed.add(assetId);
  }
  return failed;
}

/**
 * The image cache's pins for the studio: the proxy of every image the editor's document places
 * stays cached whatever the budget, so what is on screen never turns into a placeholder; only
 * images no longer placed (removed, replaced) are evicted.
 */
export const pinDocumentImages =
  (editor: EditorController): IsPinned =>
  (assetId, variant) =>
    variant === "proxy" && documentAssetIds(editor.store.getState().document).has(assetId);

const surfacesShowing = (document: DesignDocument, assetId: string) =>
  printAreaCodeSchema.options.filter((code) =>
    document.surfaces[code]?.elements.some((el) => el.type === "image" && el.assetId === assetId),
  );

async function download(url: string): Promise<Blob> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Image download answered ${response.status}`);
  return response.blob();
}

/**
 * The stored file of a design's image: its presigned link (cached like `useDownloadLink`), then the
 * file; a failed download asks for a fresh link once (it may have expired) before giving up.
 */
export async function downloadAsset(
  client: QueryClient,
  designId: string,
  assetId: string,
): Promise<Blob> {
  const link = (fresh: boolean) => {
    const query = downloadLinkQuery("asset", designId, assetId);
    return client.fetchQuery(fresh ? { ...query, staleTime: 0 } : query);
  };
  try {
    return await download((await link(false)).url);
  } catch {
    return download((await link(true)).url);
  }
}

/**
 * Loads every image the document places into the image cache (proxy variant): its presigned link
 * (cached like `useDownloadLink`), the file, the decode. A failed download asks for a fresh link
 * once (it may have expired); when that fails too, or the file does not decode, the asset is an
 * `error` and stays a placeholder until it is tried again: when the browser is back online, on
 * `retryFailed` (the check panel's "Tải lại ảnh"), or when the image is placed again. Surfaces
 * showing an image are repainted when it arrives. The
 * workspace pins placed images in the cache (`pinDocumentImages`), so a loaded one is never
 * evicted while placed; one placed again after its eviction is fetched again.
 * Returns preflight's `assets` (`status`): an image still loading counts as ready, only a failure is
 * an error, and an id the design has no stored image for is left out (preflight then reports it).
 */
export function useAssetImages({ designId, editor, assets, images, repaint }: Options) {
  const client = useQueryClient();
  const key = useStore(editor.store, (state) => assetIdsKey(state.document));
  const placements = useStore(editor.store, (state) => placementsKey(state.document));
  const [failures, setFailures] = useState<Failures>(() => new Map());
  const failed = useMemo(() => stillFailed(failures, placements), [failures, placements]);
  const loading = useRef(new Set<string>());

  const load = useEffectEvent(async (assetId: string) => {
    // Marked with the elements that place it now: placed again by another, it is tried again.
    const markFailed = () => {
      const placedBy = placementsOf(editor.store.getState().document, assetId);
      setFailures((prev) => new Map(prev).set(assetId, placedBy));
    };
    const markLoaded = () =>
      setFailures((prev) => {
        if (!prev.has(assetId)) return prev;
        const next = new Map(prev);
        next.delete(assetId);
        return next;
      });
    try {
      await images.load(assetId, await downloadAsset(client, designId, assetId), "proxy");
    } catch {
      return markFailed();
    }
    markLoaded();
    repaint.request(surfacesShowing(editor.store.getState().document, assetId));
  });

  // Back online, every failed image is worth another try.
  useEffect(() => {
    const retryAll = () => setFailures(new Map());
    window.addEventListener("online", retryAll);
    return () => window.removeEventListener("online", retryAll);
  }, []);
  const [retryFailed] = useState(() => () => setFailures(new Map()));

  // Whenever the placed images change, fetch those the cache lacks: never loaded, or evicted while
  // no longer placed and now placed again (an undo). A fresh upload put in the cache is not fetched.
  useEffect(() => {
    for (const assetId of key.split(" ")) {
      if (!assetId || loading.current.has(assetId) || failed.has(assetId)) continue;
      if (images.get(assetId, "proxy") !== undefined) continue;
      loading.current.add(assetId);
      void load(assetId).finally(() => loading.current.delete(assetId));
    }
  }, [key, images, failed]);

  const status = useMemo(() => {
    const status: Record<string, PreflightAsset> = {};
    for (const assetId of key.split(" ")) {
      const asset = assets.get(assetId);
      if (!asset) continue;
      status[assetId] = {
        contentType: asset.contentType,
        sizeBytes: asset.sizeBytes,
        status: failed.has(assetId) ? "error" : "ready",
      };
    }
    return status;
  }, [key, assets, failed]);
  return { status, retryFailed };
}
