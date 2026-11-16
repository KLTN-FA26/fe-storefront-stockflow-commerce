import type { Group } from "three";

import {
  buildGlbScene,
  disposeGlbScene,
  disposeGlbTree,
  loadGlb,
  Model3dError,
  type Model3dErrorCode,
  type Model3dRef,
} from "../model3d";
import type { SurfaceSet } from "../surfaces";
import type { BagModel, CupModel } from "../template/schema";
import type { ModelScene } from "./scene-parts";

/** Where the `.glb` of the current model stands; `code` comes with `failed`. */
export type Model3dState = { status: "loading" | "ready" | "failed"; code?: Model3dErrorCode };

/** The seam the viewer takes for loading (default `loadGlb`). */
export type LoadModel3d = typeof loadGlb;

export type SwapJob = {
  ref: Model3dRef;
  /**
   * The template's parametric model: it gives the scene its material and tells `printGeometry`
   * which print areas exist. The file is not measured or compared against it here (that is checked
   * at upload, in the back-office).
   */
  model: CupModel | BagModel;
  surfaces: SurfaceSet;
  /** Puts the built scene in place of the current one; it owns the scene from then on. */
  attach: (scene: ModelScene) => void;
};

type Hooks = { load: LoadModel3d; emit: (state: Model3dState) => void };

/**
 * The background load of one `.glb`: at most one at a time. Starting another, or `cancel`, aborts
 * the running one; whatever it still delivers is freed and never reaches the viewer or its
 * listeners. `whenReady` never rejects.
 */
export class Model3dSwap {
  private controller: AbortController | null = null;
  private finish: (() => void) | null = null;
  private ready: Promise<void> = Promise.resolve();

  constructor(private readonly hooks: Hooks) {}

  /** Resolves when the current file is in or has failed; at once when nothing is loading. */
  whenReady(): Promise<void> {
    return this.ready;
  }

  /** Aborts the running load (if any) and lets everyone waiting on it go on. */
  cancel(): void {
    this.controller?.abort();
    this.controller = null;
    this.finish?.();
    this.finish = null;
  }

  /** Emits `loading` synchronously, loads in the background, then attaches the scene or fails. */
  start(job: SwapJob): void {
    this.cancel();
    const controller = new AbortController();
    this.controller = controller;
    this.ready = new Promise<void>((resolve) => {
      this.finish = resolve;
    });
    const finish = this.finish;
    const current = () => this.controller === controller;
    const settle = () => {
      if (!current()) return;
      this.controller = null;
      this.finish = null;
      finish?.();
    };

    this.hooks.emit({ status: "loading" });
    void this.run(job, controller.signal, current)
      .catch((error: unknown) => console.error(error))
      .finally(settle);
  }

  private async run(job: SwapJob, signal: AbortSignal, current: () => boolean): Promise<void> {
    let root: Group;
    try {
      root = await this.hooks.load(job.ref.url, { signal });
    } catch (error) {
      if (current()) this.fail(error);
      return;
    }
    if (!current()) {
      disposeGlbTree(root);
      return;
    }

    let scene: ModelScene;
    try {
      scene = buildGlbScene(root, job.ref, job.model, job.surfaces);
    } catch (error) {
      disposeGlbTree(root);
      this.fail(error);
      return;
    }
    if (!current()) {
      disposeGlbScene(scene);
      return;
    }
    try {
      job.attach(scene);
    } catch (error) {
      disposeGlbScene(scene);
      this.fail(error);
      return;
    }
    this.hooks.emit({ status: "ready" });
  }

  /** The parametric model stays: report once, with the code, unless the load was just aborted. */
  private fail(error: unknown): void {
    const failure =
      error instanceof Model3dError
        ? error
        : new Model3dError("LOAD_FAILED", error instanceof Error ? error.message : String(error));
    if (failure.code === "ABORTED") return;
    console.warn(`3D model not used (${failure.code}): ${failure.message}`);
    this.hooks.emit({ status: "failed", code: failure.code });
  }
}
