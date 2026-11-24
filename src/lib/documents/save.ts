import type { DocumentFile } from "./api";

/** How long the object URL lives once the browser took the file. */
const OBJECT_URL_TTL_MS = 60_000;

/**
 * Saves the paper under the name the BE gave it. Not opened in a tab: a tab showing a blob URL saves
 * it as a random id, losing the Vietnamese name the customer files it by.
 */
export function saveDocument({ blob, fileName }: DocumentFile): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), OBJECT_URL_TTL_MS);
}
