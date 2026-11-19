import {
  getDesign,
  readDesignVersion,
  requestReview,
  submitDesign,
  uploadDesignFiles,
} from "./api";
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
 * Sends a design for review the BE's way (F-19), once, with the one repair the BE asks for:
 *  1. the saved layout's checksum (`documentChecksum`) is what every file is bound to; the studio has
 *     flushed and verified the layout before it draws, so no second save is made here;
 *  2. the three files, one `POST /designs/{id}/artifacts` each; every upload moves the version;
 *  3. the version is read again (the uploads' answers do not carry it);
 *  4. `POST /designs/{id}/technical-review-requests {version, quoteRequest?}`.
 * A `409 DESIGN_FILES_OUTDATED` (a file missing, or drawn from another layout or an older template)
 * names the roles to repair: they are drawn again by `redraw` and uploaded under the new run nonce
 * it answers (the BE never makes a replayed upload current, so a redraw with equal bytes must not
 * reuse a key), the version is read again and the request made once more. A second refusal is the
 * caller's: it asks the customer to try again. A `422 DESIGN_PREFLIGHT_FAILED` is the BE's own
 * judgement, already on the design's history: it is thrown as it is and never recorded again. Any
 * other failure is checked against the design first (`sentAfterAll`): it may have gone through.
 */
export async function sendDesign(
  id: string,
  input: {
    documentChecksum: string;
    files: SubmissionFiles;
    /** The run's nonce: part of every file's idempotency key, kept for retries of this run. */
    runNonce: string;
    redraw: (
      roles: readonly DesignFileRole[],
    ) => Promise<{ files: SubmissionFiles; runNonce: string }>;
    /** "Gửi duyệt và yêu cầu báo giá": sent with the request for review, and again after a redraw. */
    quoteRequest?: QuoteRequestInput | undefined;
  },
): Promise<Design> {
  const { documentChecksum, files, runNonce, redraw, quoteRequest } = input;
  try {
    return await submitDesign(id, { documentChecksum, files, runNonce, quoteRequest });
  } catch (error) {
    const stale = outdatedRolesOf(error);
    if (stale === null) return sentAfterAll(id, error);
    const fresh = await redraw(stale);
    await uploadDesignFiles(id, fresh.files, documentChecksum, fresh.runNonce, stale);
    const version = await readDesignVersion(id);
    try {
      // A plain submission sends no third argument: its request is `{ version }` alone.
      return await (quoteRequest
        ? requestReview(id, version, quoteRequest)
        : requestReview(id, version));
    } catch (again) {
      return sentAfterAll(id, again);
    }
  }
}
