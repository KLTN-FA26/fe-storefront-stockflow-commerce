import { getDesign, readDesignVersion, requestReview, uploadDesignFiles } from "./api";
import { isPreflightRefusal, outdatedRolesOf } from "./errors";
import type { Design, DesignFileRole, QuoteRequestInput, SubmissionFiles } from "./types";

/**
 * A failed send, before it counts as one (Flows M-1): the answer to the request for review may be
 * lost on the way while the BE took it, and a retry would then meet `DESIGN_NOT_DRAFT`. The design
 * is read again, and one now PENDING_REVIEW is the answer. The BE's own refusals that leave it a
 * draft for sure (422 `DESIGN_PREFLIGHT_FAILED`, 409 `DESIGN_FILES_OUTDATED`) are thrown at once,
 * and so is the failure when the re-read fails too.
 */
async function sentAfterAll(id: string, error: unknown): Promise<Design> {
  if (isPreflightRefusal(error) || outdatedRolesOf(error) !== null) throw error;
  const now = await getDesign(id).catch(() => null);
  if (now?.status === "PENDING_REVIEW") return now;
  throw error;
}

/**
 * Sends a design for review the BE's way (F-19), once, asking first and drawing only when told to:
 *  1. the saved layout's checksum (`documentChecksum`) is what every file is bound to; the studio has
 *     flushed and verified the layout before this, so no second save is made here;
 *  2. the design's version is read and `POST /designs/{id}/technical-review-requests
 *     {version, quoteRequest?}` is made at once, without drawing or uploading anything: the BE runs
 *     its own preflight first (a 422 `DESIGN_PREFLIGHT_FAILED` costs no file) and accepts files an
 *     earlier send already stored when they still match the layout and the template;
 *  3. a `409 DESIGN_FILES_OUTDATED` (a file missing, or drawn from another layout or an older
 *     template) names the roles to repair: they are drawn by `redraw` (unless `files` of an earlier
 *     try of this run are at hand, which are uploaded again under their own nonce) and only those
 *     roles are uploaded (the BE never makes a replayed upload current, so a redraw with equal
 *     bytes gets a new nonce), the version is read again and the request made once more.
 * A second refusal is the caller's: it asks the customer to try again. A `422
 * DESIGN_PREFLIGHT_FAILED` is the BE's own judgement, already on the design's history: it is thrown
 * as it is and never recorded again. Any other failure is checked against the design first
 * (`sentAfterAll`): it may have gone through.
 */
export async function sendDesign(
  id: string,
  input: {
    documentChecksum: string;
    /** Files an earlier try of this run drew (with their `runNonce`): kept, not drawn again. */
    files?: SubmissionFiles | undefined;
    /** The nonce of `files`: part of every file's idempotency key. */
    runNonce?: string | undefined;
    redraw: (
      roles: readonly DesignFileRole[],
    ) => Promise<{ files: SubmissionFiles; runNonce: string }>;
    /** "Gửi duyệt và yêu cầu báo giá": sent with the request for review, and again after a redraw. */
    quoteRequest?: QuoteRequestInput | undefined;
  },
): Promise<Design> {
  const { documentChecksum, files, runNonce, redraw, quoteRequest } = input;
  // A plain submission sends no third argument: its request is `{ version }` alone.
  const ask = async () => {
    const version = await readDesignVersion(id);
    return quoteRequest ? requestReview(id, version, quoteRequest) : requestReview(id, version);
  };
  try {
    return await ask();
  } catch (error) {
    const stale = outdatedRolesOf(error);
    if (stale === null) return sentAfterAll(id, error);
    const fresh = files && runNonce ? { files, runNonce } : await redraw(stale);
    await uploadDesignFiles(id, fresh.files, documentChecksum, fresh.runNonce, stale);
    try {
      return await ask();
    } catch (again) {
      return sentAfterAll(id, again);
    }
  }
}
