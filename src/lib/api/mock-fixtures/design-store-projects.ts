/**
 * Design projects in the design mock (part E spec §2, §4; docs 12 §4.9–§4.10, §5.4): a customer
 * groups designs in a project (BR-17), closes it (BR-22) and reads its history. Each operation runs
 * as an operation of `design-store.ts`, over the shared `StoreContext`.
 *
 * Rules:
 *  - a project has a name (≤ 200) and an optional description (≤ 2000), is created ACTIVE and holds
 *    at most 20 designs, ARCHIVED ones not counted (B42);
 *  - a design is in at most one project; an ARCHIVED design is not added; a PENDING_REVIEW design
 *    is not removed; adding or removing changes neither its status nor its `version` (BR-17);
 *  - a project is closed once and never reopened, and not while a design waits for review (BR-22);
 *  - a project write sends the project's `version`: a stale one is 409 VERSION_CONFLICT (BR-11).
 * The mock has one implicit customer, so a project "of another customer" is an unknown id: 404.
 */

import {
  PROJECT_DESCRIPTION_MAX,
  PROJECT_DESIGN_LIMIT,
  PROJECT_NAME_MAX,
  PROJECT_STATUSES,
  asRecord,
  boundedText,
  fail,
  invalid,
  isVersion,
  notFound,
  ok,
  projectArchived,
  projectNotFound,
  toProjectDto,
  toProjectEventDto,
  versionConflict,
  type DesignRow,
  type MockResult,
  type ProjectRow,
} from "./design-rows";
import type { StoreContext } from "./design-store-context";
import type { DesignFiles } from "./design-store-files";
import { newestFirst, pageOf, readPaging, statusFilter } from "./design-store-paging";

const projectFull = () =>
  fail(
    422,
    "PROJECT_FULL",
    `A project holds at most ${PROJECT_DESIGN_LIMIT} designs (ARCHIVED ones not counted)`,
  );

/**
 * Whether a design may join `project` now: an ACTIVE project with room (BR-17, B42). The checks
 * `POST /design-projects/{id}/designs` and `POST /designs` with a `projectId` share.
 */
export function joinRefusal(ctx: StoreContext, project: ProjectRow): MockResult | null {
  if (project.status !== "ACTIVE") return projectArchived(422);
  if (ctx.designsOf(project).length >= PROJECT_DESIGN_LIMIT) return projectFull();
  return null;
}

/**
 * Puts `row` in `project` and records it. The design's `version` and `updatedAt` stay: joining a
 * project is not a change of its content (BR-17), so an open studio's autosave is not refused.
 */
export function joinProject(ctx: StoreContext, row: DesignRow, project: ProjectRow) {
  row.projectId = project.id;
  ctx.record(row, "ADDED_TO_PROJECT", project.name, row.version);
  project.updatedAt = ctx.stamp();
}

/** The project description of an input: blank or `null` is none; `{ refused }` when it is invalid. */
function descriptionOf(value: unknown): { description: string | null } | { refused: MockResult } {
  if (value === undefined || value === null) return { description: null };
  if (typeof value !== "string")
    return { refused: invalid("description", "description must be text") };
  const text = value.trim();
  if (text.length > PROJECT_DESCRIPTION_MAX) {
    return {
      refused: invalid(
        "description",
        `description is at most ${PROJECT_DESCRIPTION_MAX} characters`,
      ),
    };
  }
  return { description: text || null };
}

export function createProjectOps(ctx: StoreContext, files: DesignFiles) {
  const designsOf = async (project: ProjectRow) =>
    Promise.all(
      ctx
        .designsOf(project)
        .sort(newestFirst)
        .map((row) => files.toDto(row)),
    );

  async function toDto(project: ProjectRow) {
    const designs = await designsOf(project);
    // The oldest round still open (rounds are kept in the order they opened), naming only the
    // designs still waiting in it: decided ones are no longer waiting, and a younger open round
    // must not hide it.
    const state = ctx.state();
    const open = state.reviewRounds.find(
      (round) => round.projectId === project.id && round.closedAt === null,
    );
    const waiting = open
      ? {
          ...open,
          designIds: open.designIds.filter((id) =>
            ctx.waitsIn(
              open,
              state.designs.find((design) => design.id === id),
            ),
          ),
        }
      : undefined;
    return toProjectDto(
      project,
      designs.length,
      designs.flatMap((design) => (design.previewUrl ? [design.previewUrl] : [])).slice(0, 4),
      waiting,
    );
  }

  return {
    /** GET /design-projects?status=&page=&size= — newest updated first, 0-based pages. */
    async list(
      query: { status?: unknown; page?: unknown; size?: unknown } = {},
    ): Promise<MockResult> {
      const status = statusFilter(query.status);
      if (status !== undefined && !PROJECT_STATUSES.some((s) => s === status)) {
        return fail(400, "UNSUPPORTED_PARAMETER", "Unsupported status filter");
      }
      const paging = readPaging(query);
      if ("refused" in paging) return paging.refused;
      const mine = ctx
        .state()
        .projects.filter((p) => status === undefined || p.status === status)
        .sort(newestFirst);
      return pageOf(mine, paging, toDto);
    },

    /** POST /design-projects `{ name, description? }` — an ACTIVE project at version 0. */
    async create(body: unknown): Promise<MockResult> {
      const input = asRecord(body);
      const name = boundedText("name", input.name, PROJECT_NAME_MAX);
      if ("refused" in name) return name.refused;
      const description = descriptionOf(input.description);
      if ("refused" in description) return description.refused;

      const state = ctx.state();
      state.seq.project += 1;
      const at = ctx.stamp();
      const project: ProjectRow = {
        id: ctx.newId(),
        seq: state.seq.project,
        name: name.text,
        description: description.description,
        status: "ACTIVE",
        version: 0,
        createdAt: at,
        updatedAt: at,
      };
      state.projects.push(project);
      ctx.recordProject(project, "PROJECT_CREATED", null, at);
      await ctx.persist();
      return ok(await toDto(project), 201);
    },

    /** GET /design-projects/{id} */
    async get(id: string): Promise<MockResult> {
      const project = ctx.findProject(id);
      return project ? ok(await toDto(project)) : projectNotFound();
    },

    /**
     * PATCH /design-projects/{id} `{ name?, description?, version }` — at least one of the two
     * fields. A closed project is read-only (409 PROJECT_ARCHIVED, before the version).
     */
    async update(id: string, body: unknown): Promise<MockResult> {
      const project = ctx.findProject(id);
      if (!project) return projectNotFound();
      const input = asRecord(body);
      if (!("name" in input) && !("description" in input)) {
        return invalid("name", "name or description is required");
      }
      let name: string | undefined;
      if ("name" in input) {
        const checked = boundedText("name", input.name, PROJECT_NAME_MAX);
        if ("refused" in checked) return checked.refused;
        name = checked.text;
      }
      let description: string | null | undefined;
      if ("description" in input) {
        const checked = descriptionOf(input.description);
        if ("refused" in checked) return checked.refused;
        description = checked.description;
      }
      if (!isVersion(input.version))
        return invalid("version", "version must be a whole number ≥ 0");
      if (project.status !== "ACTIVE") return projectArchived();
      if (project.version !== input.version) return versionConflict();
      if (name !== undefined) project.name = name;
      if (description !== undefined) project.description = description;
      project.version += 1;
      project.updatedAt = ctx.stamp();
      await ctx.persist();
      return ok(await toDto(project));
    },

    /**
     * POST /design-projects/{id}/archive `{ version }` — ACTIVE → ARCHIVED, never reopened, and
     * not while a design waits for review (409 PROJECT_HAS_PENDING; BR-22). Its designs keep
     * their status and stay in it.
     */
    async archive(id: string, body: unknown): Promise<MockResult> {
      const project = ctx.findProject(id);
      if (!project) return projectNotFound();
      const { version } = asRecord(body);
      if (!isVersion(version)) return invalid("version", "version must be a whole number ≥ 0");
      if (project.status !== "ACTIVE") return projectArchived();
      if (project.version !== version) return versionConflict();
      const pending = ctx.designsOf(project).filter((d) => d.status === "PENDING_REVIEW");
      if (pending.length) {
        return fail(
          409,
          "PROJECT_HAS_PENDING",
          "A project with a design waiting for review cannot be closed",
          { details: { designIds: pending.map((d) => d.id) } },
        );
      }
      project.status = "ARCHIVED";
      project.version += 1;
      project.updatedAt = ctx.stamp();
      ctx.recordProject(project, "PROJECT_ARCHIVED", null, project.updatedAt);
      await ctx.persist();
      return ok(await toDto(project));
    },

    /** GET /design-projects/{id}/designs — the designs of the project, ARCHIVED ones left out. */
    async designs(id: string): Promise<MockResult> {
      const project = ctx.findProject(id);
      return project ? ok(await designsOf(project)) : projectNotFound();
    },

    /**
     * POST /design-projects/{id}/designs `{ designId }` (BR-17). Adding a design the project
     * already holds answers it again, unchanged.
     */
    async addDesign(id: string, body: unknown): Promise<MockResult> {
      const project = ctx.findProject(id);
      if (!project) return projectNotFound();
      const { designId } = asRecord(body);
      if (typeof designId !== "string" || !designId.trim()) {
        return invalid("designId", "designId must not be blank");
      }
      // Not `ctx.find`: an ARCHIVED design is refused with its own reason, not as unknown.
      const row = ctx.state().designs.find((d) => d.id === designId);
      if (!row) return notFound();
      if (project.status !== "ACTIVE") return projectArchived(422);
      if (row.status === "ARCHIVED") {
        return fail(422, "DESIGN_ARCHIVED", "An ARCHIVED design cannot join a project");
      }
      if (row.projectId === project.id) return ok(await files.toDto(row));
      if (row.projectId !== null) {
        return fail(422, "DESIGN_IN_OTHER_PROJECT", "The design already belongs to a project");
      }
      const refused = joinRefusal(ctx, project);
      if (refused) return refused;
      joinProject(ctx, row, project);
      await ctx.persist();
      return ok(await files.toDto(row));
    },

    /**
     * DELETE /design-projects/{id}/designs/{designId} — takes the design out; its status and
     * content stay. A PENDING_REVIEW design is not removed (409 DESIGN_PENDING; BR-17), nor from a
     * closed project (409 PROJECT_ARCHIVED).
     */
    async removeDesign(id: string, designId: string): Promise<MockResult> {
      const project = ctx.findProject(id);
      if (!project) return projectNotFound();
      const row = ctx.find(designId);
      if (!row || row.projectId !== project.id) return notFound();
      if (project.status !== "ACTIVE") {
        return projectArchived();
      }
      if (row.status === "PENDING_REVIEW") {
        return fail(409, "DESIGN_PENDING", "A design waiting for review cannot leave its project");
      }
      row.projectId = null;
      ctx.record(row, "REMOVED_FROM_PROJECT", project.name, row.version);
      project.updatedAt = ctx.stamp();
      await ctx.persist();
      return ok(await files.toDto(row));
    },

    /** GET /design-projects/{id}/history — oldest first. */
    async history(id: string): Promise<MockResult> {
      const project = ctx.findProject(id);
      if (!project) return projectNotFound();
      return ok(
        ctx
          .state()
          .projectEvents.filter((event) => event.projectId === project.id)
          .map(toProjectEventDto),
      );
    },
  };
}
