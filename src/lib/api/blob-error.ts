/**
 * Body of a failed file download (`responseType: "blob"`, e.g. the quote PDF): the BE sends the file
 * on success but a JSON envelope on failure, and axios hands that over as a Blob. Read it into an
 * object before `ApiError.from` looks for `errorCode`, or every failure collapses into `HTTP_<status>`.
 */

/** Blob → parsed JSON; anything that is not a Blob is returned as is; a Blob that is not JSON → undefined. */
export async function readBlobErrorBody(data: unknown): Promise<unknown> {
  if (typeof Blob === "undefined" || !(data instanceof Blob)) return data;
  try {
    return JSON.parse(await data.text()) as unknown;
  } catch {
    return undefined;
  }
}
