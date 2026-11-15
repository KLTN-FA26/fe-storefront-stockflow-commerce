import { LIBRARY_LIMIT } from "./library-schemas";
import type { Gate } from "./project-rules";
import type { DesignProject, LibraryItem } from "./types";

export { LIBRARY_LIMIT };

// What the library lets the customer do now. The server decides; this only keeps the buttons from
// asking for what it would refuse, and says why (docs 12 §4.9.29, BR-18).

export type LibraryActions = {
  addImage: Gate;
  saveText: Gate;
  remove: Gate;
  place: Gate;
};

const allowed: Gate = { allowed: true };
const closed: Gate = { allowed: false, reason: "Dự án đã đóng" };

/**
 * Images and text styles are counted apart, 30 each (A-E1). A closed project takes no library
 * change and loses none, but its items still go into a design (A-E2).
 */
export function libraryActions(
  project: Pick<DesignProject, "status">,
  items: readonly Pick<LibraryItem, "kind">[],
): LibraryActions {
  if (project.status !== "ACTIVE") {
    return { addImage: closed, saveText: closed, remove: closed, place: allowed };
  }
  const images = items.filter((item) => item.kind === "IMAGE").length;
  const texts = items.length - images;
  return {
    addImage:
      images >= LIBRARY_LIMIT
        ? { allowed: false, reason: `Thư viện đã đủ ${LIBRARY_LIMIT} ảnh` }
        : allowed,
    saveText:
      texts >= LIBRARY_LIMIT
        ? { allowed: false, reason: `Thư viện đã đủ ${LIBRARY_LIMIT} mẫu chữ` }
        : allowed,
    remove: allowed,
    place: allowed,
  };
}
