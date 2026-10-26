import { vi } from "vitest";

import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/error";
import { createMockCatalog, seedMockCatalog } from "@/lib/api/mock-fixtures/catalog";
import {
  createMockDesignStudio,
  type MockDesignStudio,
  type MockResult,
} from "@/lib/api/mock-fixtures/designs";
import { settle } from "@/test/fake-backend";

import { readImageDimensions } from "../engine/assets/image-header";

/**
 * The size of an uploaded image as its header says: jsdom has no `createImageBitmap`, which the
 * mock store would use, and the fixtures (`pngBytes`, …) are headers, not decodable pictures.
 */
async function sizeFromHeader(blob: Blob) {
  const header = readImageDimensions(new Uint8Array(await blob.arrayBuffer()));
  if (!header) throw new Error("Not a readable image");
  return { width: header.width, height: header.height };
}

/**
 * A mock design store over the seeded catalogue: the approved 12oz cup and the draft kraft bag.
 * Uploaded images are sized by `sizeFromHeader` and linked as `blob:mock/{size}` (jsdom has no
 * `URL.createObjectURL` either).
 */
export const mockStudio = () =>
  createMockDesignStudio({
    userId: "7d51f000-0000-4000-8000-0000000000d1",
    customerId: "7d51f000-0000-4000-8000-0000000000d2",
    catalogKindOf: createMockCatalog(seedMockCatalog()).kindOf,
    readImageSize: sizeFromHeader,
    toUrl: (blob) => `blob:mock/${blob.size}`,
  });

/** The `params` of an axios call as a plain record. */
export const queryOf = (config: unknown) =>
  ((config as { params?: Record<string, unknown> } | undefined)?.params ?? {}) as Record<
    string,
    unknown
  >;

/** The `Idempotency-Key` header of an axios call. */
export const idempotencyKeyOf = (config: unknown) =>
  (config as { headers?: Record<string, string> } | undefined)?.headers?.["Idempotency-Key"];

/** The `file` part of a multipart body, or a 400 like the BE's when there is none. */
function filePart(body: unknown): Blob {
  const file = (body as FormData).get("file");
  if (!(file instanceof Blob)) throw new ApiError(400, "VALIDATION_FAILED", "No file part");
  return file;
}

/**
 * Routes the design calls of `api` to the mock store, the way the real client and BE would answer:
 * the list, one draft, its document and images (P3, P4) with their links, its artifacts and
 * snapshot, the P2 customization, P1 create, a fork, an image or artifact upload (multipart with
 * its `Idempotency-Key`), a document save, and the workflow writes (specification, review request
 * P5, confirmation request, confirmation, change request, withdrawal). P5 does not schedule the
 * mock QC answer: a test completes the review itself. Returns the spies so a test can say which
 * calls were (not) made.
 */
export function fakeDesignBackend(studio: MockDesignStudio) {
  const get = vi.spyOn(api, "get").mockImplementation(async (url, config) => {
    if (url === "/designs") return settle(studio.list(queryOf(config)));
    const customization = /^\/catalog\/products\/([^/]+)\/customization$/.exec(url);
    if (customization) {
      return settle(studio.customization(decodeURIComponent(customization[1]!)));
    }
    const link = /^\/designs\/([^/]+)\/artifacts\/([^/]+)\/download-url$/.exec(url);
    if (link) return settle(studio.artifactLink(link[1]!, link[2]!));
    const assetLink = /^\/designs\/([^/]+)\/assets\/([^/]+)\/download-url$/.exec(url);
    if (assetLink) return settle(studio.assetLink(assetLink[1]!, assetLink[2]!));
    const document = /^\/designs\/([^/]+)\/document$/.exec(url);
    if (document) return settle(studio.getDocument(document[1]!));
    const assets = /^\/designs\/([^/]+)\/assets$/.exec(url);
    if (assets) return settle(studio.listAssets(assets[1]!));
    const artifacts = /^\/designs\/([^/]+)\/artifacts$/.exec(url);
    if (artifacts) return settle(studio.listArtifacts(artifacts[1]!));
    const snapshot = /^\/designs\/([^/]+)\/snapshot$/.exec(url);
    if (snapshot) return settle(studio.snapshot(snapshot[1]!));
    const history = /^\/designs\/([^/]+)\/history$/.exec(url);
    if (history) return settle(studio.history(history[1]!, queryOf(config)));
    const draft = /^\/designs\/([^/]+)$/.exec(url);
    if (draft) return settle(studio.get(draft[1]!));
    throw new ApiError(404, "NOT_FOUND", `No fake route for GET ${url}`);
  });
  const workflow: Record<string, (id: string, body: never) => MockResult | Promise<MockResult>> = {
    revisions: (id) => studio.fork(id),
    "confirmation-withdrawals": (id, body) => studio.withdraw(id, body),
    "change-requests": (id, body) => studio.requestChanges(id, body),
    "technical-review-requests": (id, body) => studio.requestReview(id, body),
    "confirmation-requests": (id, body) => studio.submit(id, body),
    confirmations: (id, body) => studio.confirm(id, body),
  };
  const post = vi.spyOn(api, "post").mockImplementation(async (url, body, config) => {
    if (url === "/designs/mine") return settle(await studio.create(body as never));
    const step = /^\/designs\/([^/]+)\/([a-z-]+)$/.exec(url);
    const write = step ? workflow[step[2]!] : undefined;
    if (step && write) return settle(await write(step[1]!, body as never));
    const upload = /^\/designs\/([^/]+)\/assets$/.exec(url);
    if (upload) {
      const file = filePart(body);
      const name = file instanceof File ? file.name : undefined;
      return settle(await studio.uploadAsset(upload[1]!, file, idempotencyKeyOf(config), name));
    }
    const artifact = /^\/designs\/([^/]+)\/artifacts$/.exec(url);
    if (artifact) {
      const file = filePart(body);
      const name = file instanceof File ? file.name : undefined;
      const role = String(queryOf(config).role);
      return settle(
        await studio.uploadArtifact(artifact[1]!, role, file, idempotencyKeyOf(config), name),
      );
    }
    throw new ApiError(404, "NOT_FOUND", `No fake route for POST ${url}`);
  });
  const put = vi.spyOn(api, "put").mockImplementation(async (url, body) => {
    const document = /^\/designs\/([^/]+)\/document$/.exec(url);
    if (document) return settle(await studio.putDocument(document[1]!, body as never));
    const specification = /^\/designs\/([^/]+)\/specification$/.exec(url);
    if (specification) return settle(studio.revise(specification[1]!, body as never));
    throw new ApiError(404, "NOT_FOUND", `No fake route for PUT ${url}`);
  });
  return { get, post, put };
}
