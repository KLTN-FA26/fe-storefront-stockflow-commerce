/**
 * What the parts of the design mock store share: the state of the operation running now, the
 * clock and ids, the bookkeeping of a change (version, history) and the links to stored blobs.
 * `design-store.ts` makes one per store and lends it to its parts (`design-store-*.ts`). Its
 * functions run inside the store's operations: alone, over the state just loaded from storage.
 */

import { printConfigFor, type PrintConfigRow } from "./design-print-configs";
import type {
  DesignMockState,
  DesignRow,
  EventRow,
  ProjectEventRow,
  ProjectRow,
  ReviewRoundRow,
} from "./design-rows";
import type { DesignMockStorage } from "./design-storage";

export interface DesignMockDeps {
  storage: DesignMockStorage;
  now?: () => Date;
  newId?: () => string;
  /** Natural pixel size of an uploaded image; defaults to the browser's `createImageBitmap`. */
  readImageSize?: (blob: Blob) => Promise<{ widthPx: number; heightPx: number }>;
  /** A URL for a stored blob; defaults to `URL.createObjectURL`, or `blob:mock/{key}` without it. */
  toUrl?: (key: string, blob: Blob) => string;
  /** Releases a URL `toUrl` made; defaults to `URL.revokeObjectURL` when there is one. */
  revokeUrl?: (url: string) => void;
  /** Defaults to the mock's own print configurations. */
  printConfigFor?: (slug: string, sku: string) => PrintConfigRow | null;
}

async function browserImageSize(blob: Blob) {
  const bitmap = await createImageBitmap(blob);
  try {
    return { widthPx: bitmap.width, heightPx: bitmap.height };
  } finally {
    bitmap.close();
  }
}

const defaultToUrl = (key: string, blob: Blob) =>
  typeof URL.createObjectURL === "function" ? URL.createObjectURL(blob) : `blob:mock/${key}`;

const defaultRevokeUrl = (url: string) => {
  if (typeof URL.revokeObjectURL === "function") URL.revokeObjectURL(url);
};

export function createStoreContext(deps: DesignMockDeps) {
  const { storage } = deps;
  const now = deps.now ?? (() => new Date());
  const toUrl = deps.toUrl ?? defaultToUrl;
  const revokeUrl = deps.revokeUrl ?? defaultRevokeUrl;
  const configFor = deps.printConfigFor ?? printConfigFor;
  const stamp = () => now().toISOString();
  /** One URL per stored blob version, so a list polled every few seconds does not mint new ones. */
  const urls = new Map<string, string>();

  /** The state of the operation running now: set from storage at its start (see `use`). */
  let state!: DesignMockState;

  function record(
    row: DesignRow,
    type: EventRow["type"],
    note: string | null,
    version: number,
    at = stamp(),
  ): EventRow {
    const event: EventRow = { designId: row.id, type, at, version, note };
    state.history.push(event);
    return event;
  }

  /** A change to the design: the optimistic-lock token moves and the modification time with it. */
  function touch(row: DesignRow) {
    row.version += 1;
    row.updatedAt = stamp();
  }

  function revoke(cacheKey: string, url: string) {
    revokeUrl(url);
    urls.delete(cacheKey);
  }

  return {
    storage,
    now,
    stamp,
    newId: deps.newId ?? (() => globalThis.crypto.randomUUID()),
    readImageSize: deps.readImageSize ?? browserImageSize,
    configFor,

    state: () => state,
    /** Starts an operation over `next`, the state as stored right now. */
    use(next: DesignMockState) {
      state = next;
    },
    persist: () => storage.save({ rows: state }),

    /** A design the caller can see (ARCHIVED is not found). */
    find: (id: string) => state.designs.find((d) => d.id === id && d.status !== "ARCHIVED"),
    drafts: () => state.designs.filter((d) => d.status === "DRAFT").length,
    configOf: (row: DesignRow) => configFor(row.product.slug, row.variant.sku),

    record,
    touch,

    /** A project of the caller, whatever its status (a closed one is read-only, not hidden). */
    findProject: (id: string) => state.projects.find((project) => project.id === id),
    /** The designs of a project that count: ARCHIVED ones do not. */
    designsOf: (project: ProjectRow) =>
      state.designs.filter((d) => d.projectId === project.id && d.status !== "ARCHIVED"),
    recordProject(
      project: ProjectRow,
      type: ProjectEventRow["type"],
      note: string | null,
      at = stamp(),
    ): ProjectEventRow {
      const event: ProjectEventRow = {
        projectId: project.id,
        type,
        at,
        version: project.version,
        note,
      };
      state.projectEvents.push(event);
      return event;
    },

    /** The design waits in `round`: PENDING_REVIEW, and its latest submission is that round's. */
    waitsIn(round: ReviewRoundRow, design: DesignRow | undefined): boolean {
      if (!design || design.status !== "PENDING_REVIEW") return false;
      const submitted = state.history.filter(
        (event) => event.designId === design.id && event.type === "SUBMITTED_FOR_REVIEW",
      );
      return submitted.at(-1)?.note === round.id;
    },

    /**
     * What the reviewer decided about `designId` in `round`: the first approval or return after
     * the design was sent in that round (docs 12 §5.4). Null while it has no decision there.
     */
    decisionIn(
      round: ReviewRoundRow,
      designId: string,
    ): { type: "APPROVED" | "RETURNED"; note: string | null } | null {
      const events = state.history.filter((event) => event.designId === designId);
      const sent = events.findIndex(
        (event) => event.type === "SUBMITTED_FOR_REVIEW" && event.note === round.id,
      );
      if (sent < 0) return null;
      const decided = events
        .slice(sent + 1)
        .find((event) => event.type === "APPROVED" || event.type === "RETURNED");
      return decided ? { type: decided.type as "APPROVED" | "RETURNED", note: decided.note } : null;
    },

    /** Version + 1 and `updatedAt`, then the event at that version. */
    advance(row: DesignRow, type: EventRow["type"], note: string | null) {
      touch(row);
      record(row, type, note, row.version, row.updatedAt);
    },

    /** A URL for the blob under `key`; null when the blob is gone. A static `url` wins. */
    async link(key: string, checksum: string, url?: string): Promise<string | null> {
      if (url) return url;
      const cacheKey = `${key}#${checksum}`;
      const cached = urls.get(cacheKey);
      if (cached) return cached;
      const blob = await storage.getBlob(key);
      if (!blob) return null;
      const made = toUrl(key, blob);
      urls.set(cacheKey, made);
      return made;
    },

    /**
     * Deletes blobs no row lists any more, and the links made for them. The write that dropped
     * them is saved already, so a failure only leaves an unused blob behind: logged, never thrown.
     */
    async discardBlobs(keys: readonly string[]): Promise<void> {
      for (const key of keys) {
        for (const [cacheKey, url] of urls) {
          if (cacheKey.startsWith(`${key}#`)) revoke(cacheKey, url);
        }
        await storage.deleteBlob(key).catch((error: unknown) => {
          console.warn(`[mock-design] ${key} could not be deleted; it stays in storage.`, error);
        });
      }
    },

    /** Releases every link made so far (reset: the blobs behind them are gone). */
    revokeLinks() {
      for (const [cacheKey, url] of urls) revoke(cacheKey, url);
    },
  };
}

export type StoreContext = ReturnType<typeof createStoreContext>;
