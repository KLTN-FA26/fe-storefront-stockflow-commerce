/**
 * The design mock backend (spec 2026-11-09 §4, §5): the docs' lifecycle — DRAFT → PENDING_REVIEW
 * → APPROVED, DRAFT → ARCHIVED — for the one mock customer it serves, the caller.
 *
 * Every operation runs alone (this tab's queue, plus a Web Lock shared by all tabs when the browser
 * has one), starts from the snapshot as stored right now, and a write saves the whole state through
 * `DesignMockStorage` before it answers: a reload (IndexedDB) finds designs, documents, images and
 * submitted files again, and two tabs see each other's writes (`design-store-access.ts`). Only an
 * empty storage is seeded; one that cannot be read answers 500 and is never written over. Any other
 * failure (no `crypto.subtle` outside a secure context, a storage error) answers 500 too, logged.
 *
 * Rules (docs 12):
 *  - every write sends the version it saw; a stale one is 409 VERSION_CONFLICT (BR-11);
 *  - only a DRAFT is renamed, saved, submitted or deleted, else 409 INVALID_STATE (BR-07, BR-16),
 *    checked before the version so a tab that missed a submit learns the state changed;
 *  - at most 50 DRAFT designs, on create and on revision (§4.1, B37);
 *  - an ARCHIVED design is not found anywhere and never listed (BR-16);
 *  - a revision copies the APPROVED design's document and images (§4.7, BR-12).
 * `simulateApprove`, `simulateReturn` and `reset` stand in for the Sales Manager (spec §6.5).
 *
 * This file composes the store from its parts: the designs (`design-store-designs.ts`), their
 * document record (`design-store-documents.ts`), the list (`design-store-list.ts`), the reviewer
 * simulation (`design-store-simulation.ts`), images and file reads (`design-store-files.ts`) and
 * the submission (`design-store-submission.ts`), over what they share
 * (`design-store-context.ts`); rows and envelope are in `design-rows.ts`.
 *
 * The mock runs the product-design engine's own rules (document schema, checksum, the variant
 * preflight rules) although lib code otherwise never imports a feature: it stands in for a BE that
 * must apply the same rules, so it reuses them rather than keep a copy that could drift.
 */

import { fail, ok, stampedAt, type DesignMockState, type MockResult } from "./design-rows";
import { seedDesignState } from "./design-seed";
import { createExclusive, loadState } from "./design-store-access";
import { createStoreContext, type DesignMockDeps } from "./design-store-context";
import { createDesignOps } from "./design-store-designs";
import { createDocumentOps } from "./design-store-documents";
import { createDesignFiles } from "./design-store-files";
import { createListOps } from "./design-store-list";
import { createSimulationOps } from "./design-store-simulation";
import { createDesignSubmission } from "./design-store-submission";

export type { DesignMockDeps } from "./design-store-context";

/** 500: the operation failed (logged); nothing it would have written was saved. */
const mockFailed = () =>
  fail(500, "DESIGN_MOCK_FAILED", "The design mock could not answer; see the browser console");

export async function createDesignMockStore(deps: DesignMockDeps) {
  const ctx = createStoreContext(deps);
  const { storage } = ctx;
  const exclusive = createExclusive();
  /** Every answer's envelope carries the store's clock (`deps.now`), not the system's. */
  const stamped = (result: MockResult) => stampedAt(result, ctx.stamp());

  async function seeded(): Promise<DesignMockState> {
    const { state: fresh, blobs } = await seedDesignState(ctx.now());
    for (const [key, blob] of blobs) await storage.putBlob(key, blob);
    await storage.save({ rows: fresh });
    return fresh;
  }

  /**
   * An operation of the store: alone, over the state as stored right now (seeded only when the
   * storage is empty). A failure answers 500 and is logged, never thrown at the adapter.
   */
  function operation<A extends unknown[]>(run: (...args: A) => Promise<MockResult>) {
    return (...args: A): Promise<MockResult> =>
      exclusive(async () => {
        try {
          const stored = await loadState(storage);
          if (stored === "unreadable") return stamped(mockFailed());
          ctx.use(stored ?? (await seeded()));
          return stamped(await run(...args));
        } catch (error) {
          console.error("[mock-design] A design mock operation failed.", error);
          return stamped(mockFailed());
        }
      });
  }

  const uploads = createDesignFiles(ctx);
  const submission = createDesignSubmission(ctx, uploads);
  const designs = createDesignOps(ctx, uploads);
  const documents = createDocumentOps(ctx);
  const lists = createListOps(ctx, uploads);
  const simulation = createSimulationOps(ctx, uploads);

  return {
    /** false for memory storage: the simulation panel says data is lost on reload. */
    persistent: storage.persistent,

    list: operation(lists.list),
    draftCount: operation(lists.draftCount),
    create: operation(designs.create),
    get: operation(designs.get),
    rename: operation(designs.rename),
    history: operation(designs.history),
    getDocument: operation(documents.getDocument),
    putDocument: operation(documents.putDocument),
    listAssets: operation(uploads.listAssets),
    uploadAsset: operation(uploads.uploadAsset),
    assetLink: operation(uploads.assetLink),
    submit: operation(submission.submit),
    files: operation(uploads.files),
    recordPreflightFailure: operation(designs.recordPreflightFailure),
    remove: operation(designs.remove),
    revise: operation(designs.revise),
    simulateApprove: operation(simulation.simulateApprove),
    simulateReturn: operation(simulation.simulateReturn),

    /** GET /catalog/products/{slug}/variants/{sku}/print-config — the fixtures, not the state. */
    async printConfig(slug: string, sku: string): Promise<MockResult> {
      const config = ctx.configFor(slug, sku);
      return stamped(
        config ? ok(config) : fail(404, "NOT_FOUND", "This variant has no print configuration"),
      );
    },

    /**
     * Mock-only POST /__mock/reset — everything cleared, the seed written again, the links made so
     * far revoked. It reads nothing first: it is the way out of a storage the other operations
     * cannot read.
     */
    reset: (): Promise<MockResult> =>
      exclusive(async () => {
        try {
          await storage.clear();
          ctx.revokeLinks();
          ctx.use(await seeded());
          return stamped(ok(null));
        } catch (error) {
          console.error("[mock-design] Resetting the design mock failed.", error);
          return stamped(mockFailed());
        }
      }),
  };
}

export type DesignMockStore = Awaited<ReturnType<typeof createDesignMockStore>>;
