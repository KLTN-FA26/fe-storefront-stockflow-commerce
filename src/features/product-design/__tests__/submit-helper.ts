import { readDesignVersion, requestReview, uploadDesignFiles } from "../api";
import type { Design, QuoteRequestInput, SubmissionFiles } from "../types";

/**
 * The whole send the old way, for tests of the BE's behaviour: the three files, the version read
 * after them, then the request for review. The app itself asks first (`sendDesign`).
 */
export async function submitDesign(
  id: string,
  input: {
    documentChecksum: string;
    files: SubmissionFiles;
    runNonce: string;
    quoteRequest?: QuoteRequestInput | undefined;
  },
): Promise<Design> {
  await uploadDesignFiles(id, input.files, input.documentChecksum, input.runNonce);
  return requestReview(id, await readDesignVersion(id), input.quoteRequest);
}
