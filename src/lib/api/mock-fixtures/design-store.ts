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
 *  - a revision copies the APPROVED design's document and images (§4.7, BR-12);
 *  - designs are grouped in projects, closed once and never reopened (§4.9, BR-17, BR-22;
 *    `design-store-projects.ts`), which share a library of images and text styles (BR-18;
 *    `design-store-library.ts`) and send sets of drafts for review, all or nothing (§4.10, BR-19;
 *    `design-store-rounds.ts`).
 * `simulateApprove`, `simulateReturn`, `simulateApproveRound`, `simulateFailNextApproval`,
 * `simulateRounds` and `reset` stand in for the Sales Manager (spec §6.5; part E spec §4).
 *
 * This file composes the store from its parts: the designs (`design-store-designs.ts`), their
 * document record (`design-store-documents.ts`), the list (`design-store-list.ts`), the reviewer
 * simulation (`design-store-simulation.ts`), images and file reads (`design-store-files.ts`) and
 * the submission (`design-store-submission.ts`), the projects (`design-store-projects.ts`), their
 * library (`design-store-library.ts`) and review rounds (`design-store-rounds.ts`), and copies to
 * another variant (`design-store-clones.ts`), and the quote requests of designs and projects
 * (`design-store-quotes.ts`, WF-02 D1), over what they share (`design-store-context.ts`);
 * rows and envelope are in `design-rows.ts`.
 *
 * The mock runs the product-design engine's own rules (document schema, checksum, the variant
 * preflight rules) although lib code otherwise never imports a feature: it stands in for a BE that
 * must apply the same rules, so it reuses them rather than keep a copy that could drift.
 */

import { customizationOf, designTemplateOf } from "./design-be-contract";
import {
  fail,
  notFound,
  ok,
  stampedAt,
  type DesignMockState,
  type MockResult,
} from "./design-rows";
import { seedDesignState } from "./design-seed";
import { createExclusive, loadState } from "./design-store-access";
import { createStoreContext, type DesignMockDeps } from "./design-store-context";
import { createArtifactOps } from "./design-store-artifacts";
import { createCloneOps } from "./design-store-clones";
import { createDesignOps } from "./design-store-designs";
import { createDocumentOps } from "./design-store-documents";
import { createDesignFiles } from "./design-store-files";
import { createLibraryOps } from "./design-store-library";
import { createListOps } from "./design-store-list";
import { createProjectOps } from "./design-store-projects";
import { createQuoteOps } from "./design-store-quotes";
import { createRoundOps } from "./design-store-rounds";
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
  const rounds = createRoundOps(ctx);
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
          await rounds.sweep(); // A-E4: uploads no round took go after 24 hours
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
  const projects = createProjectOps(ctx, uploads);
  const library = createLibraryOps(ctx);
  const clones = createCloneOps(ctx, uploads);
  const artifacts = createArtifactOps(ctx, uploads);
  const quotes = createQuoteOps(ctx);

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
    uploadArtifact: operation(artifacts.upload),
    listArtifacts: operation(artifacts.list),
    artifactLink: operation(artifacts.link),
    requestReview: operation(artifacts.requestReview),
    snapshot: operation(artifacts.snapshot),
    simulateOutdatedFiles: operation(artifacts.simulateOutdatedFiles),
    simulateCorruptFile: operation(artifacts.simulateCorruptFile),
    files: operation(uploads.files),
    recordPreflightFailure: operation(designs.recordPreflightFailure),
    remove: operation(designs.remove),
    revise: operation(designs.revise),
    clone: operation(clones.clone),
    listProjects: operation(projects.list),
    createProject: operation(projects.create),
    getProject: operation(projects.get),
    updateProject: operation(projects.update),
    archiveProject: operation(projects.archive),
    projectDesigns: operation(projects.designs),
    addToProject: operation(projects.addDesign),
    removeFromProject: operation(projects.removeDesign),
    projectHistory: operation(projects.history),
    listLibrary: operation(library.list),
    uploadLibraryImage: operation(library.uploadImage),
    saveLibraryImageFromDesign: operation(library.saveImageFromDesign),
    saveLibraryText: operation(library.saveText),
    deleteLibraryItem: operation(library.deleteItem),
    placeFromLibrary: operation(library.placeInDesign),
    uploadSubmission: operation(rounds.uploadSubmission),
    openReviewRound: operation(rounds.openRound),
    submitBatch: operation(rounds.submitBatch),
    recordSetPreflightFailure: operation(rounds.recordFailures),
    requestQuote: operation(quotes.requestDesign),
    designQuoteRequests: operation(quotes.listDesign),
    requestProjectQuote: operation(quotes.requestProject),
    projectQuoteRequests: operation(quotes.listProject),
    simulateApprove: operation(simulation.simulateApprove),
    simulateReturn: operation(simulation.simulateReturn),
    simulateApproveRound: operation(simulation.simulateApproveRound),
    simulateFailNextApproval: operation(simulation.simulateFailNextApproval),
    simulateRounds: operation(simulation.simulateRounds),

    /**
     * A variant's print configuration from the fixtures, not the state (the BE has no such read, so
     * no route serves it: the route layer checks a create's template with it).
     */
    async printConfig(slug: string, sku: string): Promise<MockResult> {
      const config = ctx.configFor(slug, sku);
      return stamped(
        config ? ok(config) : fail(404, "NOT_FOUND", "This variant has no print configuration"),
      );
    },

    /**
     * GET /catalog/products/{slug}/customization — the BE's read of a product's templates, over the
     * same fixtures (`design-be-contract.ts`), as far as starting a design needs it.
     */
    async customization(slug: string, skuHint?: string): Promise<MockResult> {
      return stamped(customizationOf(slug, ctx.configFor, skuHint));
    },

    /** GET /designs/{id}/template — the template the design is drawn on, in the BE's shape. */
    designTemplate: operation(async (id: string): Promise<MockResult> => {
      const row = ctx.find(id);
      return row ? designTemplateOf(ctx.configOf(row)) : notFound();
    }),

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
