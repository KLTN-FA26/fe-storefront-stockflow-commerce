import { designAssetDtoSchema } from "../../schemas";
import type { DesignAsset } from "../../types";

/** The drag data type of a tile of the image library: the stored image as JSON. */
export const ASSET_DRAG_TYPE = "application/x-stockflow-asset";

/**
 * Whether a drag carries a tile of the image library. From the types alone: a browser keeps the
 * drag data unreadable until the drop, and `dragover` must decide whether to take it.
 */
export const carriesAsset = (data: Pick<DataTransfer, "types">): boolean =>
  Array.from(data.types).includes(ASSET_DRAG_TYPE);

/** The image a drag carries, `null` when it carries none (a file from the OS, text) or junk. */
export function readDraggedAsset(
  data: Pick<DataTransfer, "types" | "getData">,
): DesignAsset | null {
  if (!carriesAsset(data)) return null;
  try {
    const parsed = designAssetDtoSchema.safeParse(JSON.parse(data.getData(ASSET_DRAG_TYPE)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** The drag data type of a tile of the project library: the id of the library item, as text. */
export const LIBRARY_DRAG_TYPE = "application/x-stockflow-library-item";

/** Whether a drag carries a tile of the project library (types only, like `carriesAsset`). */
export const carriesLibraryItem = (data: Pick<DataTransfer, "types">): boolean =>
  Array.from(data.types).includes(LIBRARY_DRAG_TYPE);

/** The id of the library item a drag carries, `null` when it carries none. */
export function readDraggedLibraryItem(
  data: Pick<DataTransfer, "types" | "getData">,
): string | null {
  if (!carriesLibraryItem(data)) return null;
  return data.getData(LIBRARY_DRAG_TYPE).trim() || null;
}
