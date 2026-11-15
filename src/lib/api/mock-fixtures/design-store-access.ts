/**
 * How every operation of the design mock reaches its stored state (controller ruling R11):
 *  - it runs alone — in this tab's queue always, and under the Web Lock `stockflow-design-mock` that
 *    every tab shares when the browser has Web Locks (secure contexts) — so an operation never
 *    interleaves with another one of this tab, nor with one of another tab;
 *  - it starts from the snapshot as stored right now, so two tabs see each other's writes and a
 *    stale write answers 409 (spec §9);
 *  - only an empty storage is seeded; a storage that cannot be read, or holds a shape this store
 *    does not know, is never written over: the operation answers 500 and says so in the console.
 */

import type { DesignMockState } from "./design-rows";
import type { DesignMockStorage } from "./design-storage";

export const DESIGN_MOCK_LOCK = "stockflow-design-mock";

/** Runs tasks one at a time, each under the shared Web Lock when the browser has one. */
export function createExclusive() {
  let tail: Promise<unknown> = Promise.resolve();
  return function exclusive<T>(task: () => Promise<T>): Promise<T> {
    const locked = async (): Promise<T> => {
      const locks = typeof navigator === "undefined" ? undefined : navigator.locks;
      // The lock is held until the task settles; `request` resolves with the task's result.
      return locks ? await locks.request(DESIGN_MOCK_LOCK, task) : await task();
    };
    const result = tail.then(locked);
    tail = result.catch(() => undefined);
    return result;
  };
}

/** The collections of part E: a snapshot stored before them lacks them. */
type LaterCollection =
  | "projects"
  | "projectEvents"
  | "library"
  | "reviewRounds"
  | "submissionUploads"
  | "failNextApproval";

/**
 * A snapshot this store can read: the state of before design projects (part E) has none of the
 * later collections and no `seq.project`; `completed` adds them, empty.
 */
type StoredState = Omit<DesignMockState, LaterCollection | "seq"> &
  Partial<Pick<DesignMockState, LaterCollection>> & { seq: { design: number; project?: number } };

const hasSeq = (project: unknown) =>
  typeof project === "object" &&
  project !== null &&
  typeof (project as { seq?: unknown }).seq === "number";

function isState(rows: Record<string, unknown>): rows is StoredState {
  const { designs, documents, assets, history, files, seq, projects, projectEvents, library } =
    rows;
  return (
    [designs, assets, history, files].every(Array.isArray) &&
    (projects === undefined || Array.isArray(projects)) &&
    (projectEvents === undefined || Array.isArray(projectEvents)) &&
    (library === undefined || Array.isArray(library)) &&
    (rows.reviewRounds === undefined || Array.isArray(rows.reviewRounds)) &&
    (rows.submissionUploads === undefined || Array.isArray(rows.submissionUploads)) &&
    (rows.failNextApproval === undefined || Array.isArray(rows.failNextApproval)) &&
    (projects === undefined || projects.every(hasSeq)) &&
    typeof documents === "object" &&
    documents !== null &&
    typeof seq === "object" &&
    seq !== null
  );
}

/** The stored state with the collections of later parts present: empty when it predates them. */
function completed(stored: StoredState): DesignMockState {
  const projects = stored.projects ?? [];
  const projectSeq = Math.max(stored.seq.project ?? 0, ...projects.map((project) => project.seq));
  return {
    ...stored,
    projects,
    projectEvents: stored.projectEvents ?? [],
    library: stored.library ?? [],
    reviewRounds: stored.reviewRounds ?? [],
    submissionUploads: stored.submissionUploads ?? [],
    failNextApproval: stored.failNextApproval ?? [],
    seq: { ...stored.seq, project: projectSeq },
  };
}

/** The stored state; `null` when the storage is empty; `"unreadable"` (logged) otherwise. */
export async function loadState(
  storage: DesignMockStorage,
): Promise<DesignMockState | null | "unreadable"> {
  let snapshot;
  try {
    snapshot = await storage.load();
  } catch (error) {
    console.error(
      "[mock-design] The design mock's storage cannot be read; nothing was changed. Reset the mock (POST /__mock/reset) to start again.",
      error,
    );
    return "unreadable";
  }
  if (snapshot === null) return null;
  if (isState(snapshot.rows)) return completed(snapshot.rows);
  console.error(
    "[mock-design] The stored design mock data has a shape this version does not know; nothing was changed. Reset the mock (POST /__mock/reset) to start again.",
    snapshot.rows,
  );
  return "unreadable";
}
