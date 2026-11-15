import { type BufferGeometry, Camera, Light, Mesh, type Group } from "three";

import { disposeTree } from "./dispose";

/**
 * Loading a `.glb` from a URL goes through a small cache of the BYTES (never of parsed trees: a
 * scene takes ownership of the tree it is given, so every `loadGlb` call parses its own copy).
 *
 * - One shared download per URL at a time. It is not tied to any caller's abort signal: a caller that
 *   aborts stops waiting (`ABORTED`) while the download goes on for the others and for the cache.
 *   Its 15 s limit runs from when the download started; each call's parse has its own 15 s.
 * - The bytes of a successful download are kept for the last 4 URLs (least recently used dropped).
 *   Parsing uses a copy of the kept buffer, so the cache entry is never touched by a parser.
 * - A failed download (HTTP error, network error, the 15 s timeout) is remembered for 60 s: a call of
 *   the same URL in that window fails at once with the same code and reason, without a request.
 *   It is remembered only briefly so that a flaky connection recovers without a page reload, while
 *   a set submission of N designs does not make N slow requests (and N times 15 s of waiting) to a
 *   file that is down. An abort is never remembered. An `ArrayBuffer` source bypasses all of this.
 */

export type Model3dErrorCode = "LOAD_FAILED" | "ABORTED" | "MESH_MISSING" | "INVALID_MODEL";

/** Why a `LOAD_FAILED` happened. */
export type Model3dLoadReason = "timeout" | "http" | "network" | "parse";

/** Why a `.glb` could not be loaded or become a scene; the viewer falls back to the code-built model. */
export class Model3dError extends Error {
  readonly code: Model3dErrorCode;
  /** Set for `LOAD_FAILED`. */
  readonly reason?: Model3dLoadReason;

  constructor(code: Model3dErrorCode, message: string, reason?: Model3dLoadReason) {
    super(message);
    this.name = "Model3dError";
    this.code = code;
    if (reason) this.reason = reason;
  }
}

/** A glTF is in metres; the engine works in millimetres. */
export const MM_PER_METRE = 1000;
/** How long a download, and separately a parse, may take before it fails (spec 2026-11-13 §8). */
export const LOAD_TIMEOUT_MS = 15_000;
/** Bytes of this many URLs are kept. */
export const KEPT_URLS = 4;
/** A failed download is remembered this long. */
export const FAILURE_MEMORY_MS = 60_000;

/**
 * Scales the whole tree from metres to millimetres and bakes it (exported for tests, not part of the
 * public barrel): every node's translation and every geometry (once,
 * also when shared) is multiplied by 1000, node rotations and scales are left alone. That is the
 * same as scaling the world by 1000, so every mesh keeps its place and its `matrixWorld` is in mm.
 * Morph targets, skins and instanced meshes are not scaled: the file convention forbids animation.
 */
export function bakeMillimetres(root: Group) {
  const factor = MM_PER_METRE;
  const scaled = new Set<BufferGeometry>();
  const drop: (Light | Camera)[] = [];
  root.traverse((object) => {
    object.position.multiplyScalar(factor);
    if (object instanceof Mesh && !scaled.has(object.geometry)) {
      scaled.add(object.geometry);
      object.geometry.scale(factor, factor, factor);
    }
    // The viewer lights the scene itself.
    if (object instanceof Light || object instanceof Camera) drop.push(object);
  });
  drop.forEach((object) => object.removeFromParent());
  root.updateMatrixWorld(true);
}

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

const timeoutError = (reason: string) =>
  new Model3dError("LOAD_FAILED", `Nạp model 3D quá thời gian chờ 15 giây (${reason})`, "timeout");

type Download = { promise: Promise<ArrayBuffer>; cancel: () => void };
type Failure = { code: "LOAD_FAILED"; message: string; reason?: Model3dLoadReason; until: number };

const downloads = new Map<string, Download>();
const kept = new Map<string, ArrayBuffer>();
const failures = new Map<string, Failure>();
let generation = 0;

/** Empties the byte cache, the remembered failures and cancels running downloads (tests only). */
export function resetGlbCacheForTests() {
  generation += 1;
  downloads.forEach((download) => download.cancel());
  downloads.clear();
  kept.clear();
  failures.clear();
}

function startDownload(url: string): Download {
  const mine = generation;
  const control = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      control.abort();
      reject(timeoutError("tải file"));
    }, LOAD_TIMEOUT_MS);
  });
  timeout.catch(() => undefined);

  const run = async (): Promise<ArrayBuffer> => {
    try {
      const bytes = await Promise.race([
        (async () => {
          const response = await fetch(url, { signal: control.signal });
          if (!response.ok) {
            throw new Model3dError(
              "LOAD_FAILED",
              `Không tải được file .glb (HTTP ${response.status})`,
              "http",
            );
          }
          return response.arrayBuffer();
        })(),
        timeout,
      ]);
      if (mine === generation) {
        kept.delete(url);
        kept.set(url, bytes);
        while (kept.size > KEPT_URLS) kept.delete(kept.keys().next().value!);
      }
      return bytes;
    } catch (error) {
      const failure =
        error instanceof Model3dError
          ? error
          : new Model3dError(
              "LOAD_FAILED",
              `Không tải được file .glb: ${messageOf(error)}`,
              "network",
            );
      if (mine === generation) {
        failures.set(url, {
          code: "LOAD_FAILED",
          message: failure.message,
          ...(failure.reason ? { reason: failure.reason } : {}),
          until: Date.now() + FAILURE_MEMORY_MS,
        });
      }
      throw failure;
    } finally {
      clearTimeout(timer);
      if (mine === generation) downloads.delete(url);
    }
  };
  const promise = run();
  promise.catch(() => undefined);
  return { promise, cancel: () => control.abort() };
}

/** The bytes of a URL: kept, remembered as failed, or one shared download. */
function bytesOf(url: string): Promise<ArrayBuffer> {
  const hit = kept.get(url);
  if (hit) {
    kept.delete(url);
    kept.set(url, hit);
    return Promise.resolve(hit);
  }
  const failure = failures.get(url);
  if (failure) {
    if (Date.now() < failure.until) {
      return Promise.reject(new Model3dError(failure.code, failure.message, failure.reason));
    }
    failures.delete(url);
  }
  let download = downloads.get(url);
  if (!download) {
    download = startDownload(url);
    downloads.set(url, download);
  }
  return download.promise;
}

/**
 * Loads a `.glb` (a URL, or its bytes) into a three `Group` in millimetres. A URL goes through the
 * byte cache described at the top of this file. three's loader is imported on demand; no Draco, KTX2
 * or Meshopt decoder is set up, so a file that needs one fails as `LOAD_FAILED` (`reason: "parse"`),
 * like a network error (`"network"`), an HTTP error (`"http"`), or a download or parse longer than
 * 15 s (`"timeout"`). An aborted `signal` rejects with `ABORTED` (a tree parsed after that is freed).
 */
export async function loadGlb(
  source: string | ArrayBuffer,
  opts: { signal?: AbortSignal } = {},
): Promise<Group> {
  const aborted = () => new Model3dError("ABORTED", "Việc nạp model 3D đã bị huỷ");
  if (opts.signal?.aborted) throw aborted();

  const work = new AbortController();
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stop = () => work.abort();
  opts.signal?.addEventListener("abort", stop, { once: true });
  const interruption = () => (timedOut ? timeoutError("phân tích file") : aborted());
  const interrupted = new Promise<never>((_, reject) => {
    work.signal.addEventListener("abort", () => reject(interruption()), { once: true });
  });
  interrupted.catch(() => undefined);
  const until = <T>(step: Promise<T>): Promise<T> => Promise.race([step, interrupted]);

  try {
    const { GLTFLoader } = await until(import("three/addons/loaders/GLTFLoader.js"));
    // A URL's kept buffer is parsed through a copy; a caller's own buffer is used as it is.
    const bytes = typeof source === "string" ? (await until(bytesOf(source))).slice(0) : source;

    // The parse has its own limit, from when it starts.
    timer = setTimeout(() => {
      timedOut = true;
      work.abort();
    }, LOAD_TIMEOUT_MS);
    const gltf = await until(
      new Promise<{ scene?: Group }>((resolve, reject) => {
        try {
          new GLTFLoader().parse(
            bytes,
            "",
            (parsed) => {
              // Aborted while parsing: nothing will use this tree, free it now.
              if (work.signal.aborted && parsed.scene) disposeTree(parsed.scene);
              resolve(parsed);
            },
            reject,
          );
        } catch (error) {
          reject(error);
        }
      }),
    );
    const root = gltf.scene;
    if (!root) {
      throw new Model3dError("LOAD_FAILED", "File .glb không có cảnh nào", "parse");
    }
    if (work.signal.aborted) {
      disposeTree(root);
      throw interruption();
    }

    bakeMillimetres(root);
    return root;
  } catch (error) {
    if (error instanceof Model3dError) throw error;
    if (work.signal.aborted) throw interruption();
    throw new Model3dError("LOAD_FAILED", `Không nạp được file .glb: ${messageOf(error)}`, "parse");
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", stop);
  }
}
