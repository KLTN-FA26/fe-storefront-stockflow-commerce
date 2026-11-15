/**
 * The project library in the design mock (part E spec §2, §4; docs 12 §4.9.29, BR-18): images and
 * saved text styles a customer shares between the designs of a project. Each operation runs as an
 * operation of `design-store.ts`, over the shared `StoreContext`.
 *
 * Rules:
 *  - an image is checked against the DEFAULT file rules (PNG or JPEG, 50 MB; B34) and the library
 *    holds at most 30 images; ASSUMPTION (A-E1): at most 30 text styles too, counted apart;
 *  - a text style holds exactly the look fields of a text element, so placing one makes an
 *    ordinary text element (the client does that; the mock only stores it);
 *  - a closed project takes no library change and loses none (409 / 422 `PROJECT_ARCHIVED`), but
 *    ASSUMPTION (A-E2): its items still go into a design;
 *  - placing an image in a design COPIES it (its own row and bytes) and checks it against the
 *    file rules of that design's variant: a refusal is 422 `FILE_RULE`, `details` naming the rule
 *    (BR-18); deleting a library item never touches the copies (BR-18);
 *  - the project's history records `ASSET_ADDED` / `ASSET_REMOVED` (docs 12 §5.4).
 */

import {
  libraryItemNotFound,
  invalid,
  ok,
  projectArchived,
  projectNotFound,
  asRecord,
  toLibraryItemDto,
  libraryKey,
  LIBRARY_TEXT_MAX,
  type LibraryRow,
  type MockResult,
  type TextStyle,
} from "./design-rows";
import type { StoreContext } from "./design-store-context";
import { createLibraryImageOps } from "./design-store-library-images";
import {
  createLibraryHelpers,
  libraryFull,
  nameOfText,
  textStyleSchema,
} from "./design-store-library-shared";

export function createLibraryOps(ctx: StoreContext) {
  const helpers = createLibraryHelpers(ctx);
  const { itemsOf, isFull, toDto } = helpers;

  return {
    ...createLibraryImageOps(ctx, helpers),
    /** GET /design-projects/{id}/library — images and text styles, newest first. */
    async list(id: string): Promise<MockResult> {
      const project = ctx.findProject(id);
      if (!project) return projectNotFound();
      return ok(await Promise.all(itemsOf(project).reverse().map(toDto)));
    },

    /** POST /design-projects/{id}/library/texts `{ text, style }`. */
    async saveText(id: string, body: unknown): Promise<MockResult> {
      const project = ctx.findProject(id);
      if (!project) return projectNotFound();
      if (project.status !== "ACTIVE") return projectArchived(422);
      const input = asRecord(body);
      const text = typeof input.text === "string" ? input.text.trim() : "";
      if (!text) return invalid("text", "text must not be blank");
      if (text.length > LIBRARY_TEXT_MAX) {
        return invalid("text", `text is at most ${LIBRARY_TEXT_MAX} characters`);
      }
      const parsed = textStyleSchema.safeParse(input.style);
      if (!parsed.success) {
        return invalid("style", parsed.error.issues[0]?.message ?? "style is not a text style");
      }
      if (isFull(project, "TEXT")) return libraryFull("TEXT");
      const row: LibraryRow = {
        id: ctx.newId(),
        projectId: project.id,
        kind: "TEXT",
        name: nameOfText(text),
        createdAt: ctx.stamp(),
        text,
        style: parsed.data satisfies TextStyle,
      };
      ctx.state().library.push(row);
      ctx.recordProject(project, "ASSET_ADDED", row.name);
      project.updatedAt = ctx.stamp();
      await ctx.persist();
      return ok(await toDto(row), 201);
    },

    /**
     * DELETE /design-projects/{id}/library/{itemId} — answers the removed item. The designs that
     * used it keep their copies and their bytes (BR-18).
     */
    async deleteItem(id: string, itemId: string): Promise<MockResult> {
      const project = ctx.findProject(id);
      if (!project) return projectNotFound();
      const row = itemsOf(project).find((item) => item.id === itemId);
      if (!row) return libraryItemNotFound();
      if (project.status !== "ACTIVE") return projectArchived();
      const state = ctx.state();
      state.library = state.library.filter((item) => item.id !== row.id);
      ctx.recordProject(project, "ASSET_REMOVED", row.name);
      project.updatedAt = ctx.stamp();
      await ctx.persist();
      if (row.kind === "IMAGE" && !row.url) await ctx.discardBlobs([libraryKey(row.id)]);
      return ok(toLibraryItemDto(row, null));
    },
  };
}
