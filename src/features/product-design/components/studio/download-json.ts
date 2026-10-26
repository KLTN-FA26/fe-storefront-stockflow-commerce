import type { DesignDocument } from "../../engine";

/**
 * Saves the document on screen as a JSON file named after the design (an object URL, revoked
 * once used): the customer's own copy when an edit cannot be stored.
 */
export function downloadDocumentJson(document: DesignDocument, designId: string) {
  const blob = new Blob([JSON.stringify(document, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = window.document.createElement("a");
  link.href = url;
  link.download = `thiet-ke-${designId}.json`;
  window.document.body.append(link);
  link.click();
  link.remove();
  // After the click has handed the file to the browser's download.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
