/**
 * What the library operations share (`design-store-library.ts`, `design-store-library-images.ts`):
 * the refusals, the default file rules, the count of a library and the way an image enters it.
 */

import { textElementSchema } from "@/features/product-design/engine/document/schema";

import { DEFAULT_FILE_RULES } from "./design-print-configs";
import {
  LIBRARY_LIMIT,
  LIBRARY_NAME_MAX,
  fail,
  libraryKey,
  ok,
  toLibraryItemDto,
  type LibraryImageRow,
  type LibraryRow,
  type MockResult,
  type ProjectRow,
} from "./design-rows";
import type { StoreContext } from "./design-store-context";
import { ruleRefusal, withBlobs } from "./design-store-files";

/** The look fields of a text element, and nothing else: the shape a saved text style has. */
export const textStyleSchema = textElementSchema.pick({
  fontCode: true,
  sizePt: true,
  color: true,
  bold: true,
  italic: true,
  align: true,
  outline: true,
  letterSpacingEm: true,
  lineHeight: true,
});

/** R-E6: a library serves the designs of its own project only (BR-17, BR-18). */
export const notInProject = () =>
  fail(422, "NOT_IN_PROJECT", "The design does not belong to this project");

export const libraryFull = (kind: LibraryRow["kind"]) =>
  fail(
    422,
    "LIBRARY_FULL",
    `A project library holds at most ${LIBRARY_LIMIT} ${kind === "IMAGE" ? "images" : "text styles"}`,
    { details: { kind, limit: LIBRARY_LIMIT } },
  );

/** The default file rules as a refusal of an upload, or null when `file` passes (BR-18, B34). */
export const defaultRuleRefusal = (contentType: string, sizeBytes: number) =>
  ruleRefusal(DEFAULT_FILE_RULES, contentType, sizeBytes);

/** A text as a list entry: its words on one line, cut at `LIBRARY_NAME_MAX`. */
export function nameOfText(text: string): string {
  const line = text.replace(/\s+/g, " ");
  return line.length <= LIBRARY_NAME_MAX ? line : `${line.slice(0, LIBRARY_NAME_MAX - 1)}…`;
}

export function createLibraryHelpers(ctx: StoreContext) {
  const itemsOf = (project: ProjectRow) =>
    ctx.state().library.filter((item) => item.projectId === project.id);

  const isFull = (project: ProjectRow, kind: LibraryRow["kind"]) =>
    itemsOf(project).filter((item) => item.kind === kind).length >= LIBRARY_LIMIT;

  async function toDto(row: LibraryRow) {
    const previewUrl =
      row.kind === "IMAGE" ? await ctx.link(libraryKey(row.id), row.checksum, row.url) : null;
    return toLibraryItemDto(row, previewUrl);
  }

  /** The item is in the library: saved with its bytes first, then its row and the event. */
  async function addImage(
    project: ProjectRow,
    image: Omit<LibraryImageRow, "id" | "projectId" | "kind" | "name" | "createdAt">,
    bytes: Blob | null,
  ): Promise<MockResult> {
    const row: LibraryImageRow = {
      ...image,
      id: ctx.newId(),
      projectId: project.id,
      kind: "IMAGE",
      name: image.originalName,
      createdAt: ctx.stamp(),
    };
    await withBlobs(ctx, async (put) => {
      if (bytes) await put(libraryKey(row.id), bytes);
      ctx.state().library.push(row);
      ctx.recordProject(project, "ASSET_ADDED", row.name);
      project.updatedAt = ctx.stamp();
      await ctx.persist();
    });
    return ok(await toDto(row), 201);
  }

  return { itemsOf, isFull, toDto, addImage };
}

export type LibraryHelpers = ReturnType<typeof createLibraryHelpers>;
