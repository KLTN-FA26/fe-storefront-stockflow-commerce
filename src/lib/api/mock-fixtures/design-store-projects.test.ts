import { describe, expect, it } from "vitest";

import { isDesignMockPath } from "../mock-adapter";
import type { DesignDto, DesignEventDto, MockResult } from "./design-rows";
import { MOCK_DESIGN_IDS } from "./design-seed";
import { createMemoryStorage } from "./design-storage";
import { createDesignMockStore, type DesignMockDeps } from "./design-store";

const uuid = (n: number) => `5e5e0000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
const T0 = Date.UTC(2026, 10, 12, 8, 0, 0);
const CUP12 = { productSlug: "ly-giay-2-lop-12oz", sku: "CUP-PAPER-12OZ-WHT" };

function makeStore(extra: Partial<DesignMockDeps> = {}) {
  let ids = 0;
  let clock = T0;
  return createDesignMockStore({
    storage: createMemoryStorage(),
    now: () => new Date((clock += 1000)),
    newId: () => uuid(0x2000 + ids++),
    readImageSize: async () => ({ widthPx: 1200, heightPx: 800 }),
    toUrl: (key) => `blob:test/${key}`,
    ...extra,
  });
}
type Store = Awaited<ReturnType<typeof makeStore>>;

interface Project {
  id: string;
  name: string;
  description: string | null;
  status: "ACTIVE" | "ARCHIVED";
  designCount: number;
  previewUrls: string[];
  openRound: null;
  createdAt: string;
  updatedAt: string;
  version: number;
}
interface ProjectEvent {
  type: string;
  at: string;
  version: number;
  note: string | null;
}

const data = <T>(result: MockResult) => (result.data as { data: T }).data;
const refusal = (result: MockResult) => [
  result.status,
  (result.data as { errorCode: string }).errorCode,
];

async function newProject(store: Store, name = "Quán Hoa", description?: string) {
  const result = await store.createProject({ name, description });
  expect(result.status).toBe(201);
  return data<Project>(result);
}

async function draft(store: Store, name = "Ly") {
  const result = await store.create({ ...CUP12, name });
  expect(result.status).toBe(201);
  return data<DesignDto>(result);
}

async function designHistory(store: Store, id: string) {
  return data<DesignEventDto[]>(await store.history(id)).map((e) => e.type);
}

describe("design projects: create, read, update, list", () => {
  it("creates an ACTIVE project at version 0 with PROJECT_CREATED, an empty set and no round", async () => {
    const store = await makeStore();
    const project = await newProject(store, "  Quán Hoa  ", "Bộ nhận diện");

    expect(project).toMatchObject({
      name: "Quán Hoa",
      description: "Bộ nhận diện",
      status: "ACTIVE",
      designCount: 0,
      previewUrls: [],
      openRound: null,
      version: 0,
    });
    expect(data<Project>(await store.getProject(project.id))).toEqual(project);
    const history = data<ProjectEvent[]>(await store.projectHistory(project.id));
    expect(history).toEqual([
      { type: "PROJECT_CREATED", at: project.createdAt, version: 0, note: null },
    ]);
  });

  it("refuses a blank or too long name and a too long description (422); a blank description is null", async () => {
    const store = await makeStore();
    expect(refusal(await store.createProject({ name: "   " }))).toEqual([422, "VALIDATION_FAILED"]);
    expect(refusal(await store.createProject({ name: "x".repeat(201) }))).toEqual([
      422,
      "VALIDATION_FAILED",
    ]);
    expect(
      refusal(await store.createProject({ name: "A", description: "x".repeat(2001) })),
    ).toEqual([422, "VALIDATION_FAILED"]);
    expect(refusal(await store.createProject({ name: "A", description: 5 }))).toEqual([
      422,
      "VALIDATION_FAILED",
    ]);
    const ok200 = await store.createProject({ name: "x".repeat(200), description: "  " });
    expect(ok200.status).toBe(201);
    expect(data<Project>(ok200).description).toBeNull();
  });

  it("an unknown project is 404", async () => {
    const store = await makeStore();
    expect(refusal(await store.getProject("nope"))).toEqual([404, "NOT_FOUND"]);
    expect(refusal(await store.projectDesigns("nope"))).toEqual([404, "NOT_FOUND"]);
    expect(refusal(await store.projectHistory("nope"))).toEqual([404, "NOT_FOUND"]);
    expect(refusal(await store.updateProject("nope", { name: "A", version: 0 }))).toEqual([
      404,
      "NOT_FOUND",
    ]);
  });

  it("updates the name and description with the version; a stale version is 409 VERSION_CONFLICT", async () => {
    const store = await makeStore();
    const project = await newProject(store);

    const renamed = await store.updateProject(project.id, {
      name: "Quán Hoa 2",
      description: null,
      version: 0,
    });
    expect(renamed.status).toBe(200);
    expect(data<Project>(renamed)).toMatchObject({
      name: "Quán Hoa 2",
      description: null,
      version: 1,
    });

    expect(refusal(await store.updateProject(project.id, { name: "Cũ", version: 0 }))).toEqual([
      409,
      "VERSION_CONFLICT",
    ]);
    expect(refusal(await store.updateProject(project.id, { name: "A" }))).toEqual([
      422,
      "VALIDATION_FAILED",
    ]);
    expect(refusal(await store.updateProject(project.id, { version: 1 }))).toEqual([
      422,
      "VALIDATION_FAILED",
    ]);
    expect(data<Project>(await store.getProject(project.id)).name).toBe("Quán Hoa 2");
  });

  it("lists newest updated first, by status, with 0-based pages", async () => {
    const store = await makeStore();
    const a = await newProject(store, "A");
    const b = await newProject(store, "B");
    const c = await newProject(store, "C");
    await store.archiveProject(a.id, { version: 0 });
    await store.updateProject(b.id, { name: "B2", version: 0 });

    const all = data<{ items: Project[]; totalElements: number }>(await store.listProjects({}));
    expect(all.items.map((p) => p.name)).toEqual(["B2", "A", "C"]);
    expect(all.totalElements).toBe(3);

    const active = data<{ items: Project[] }>(await store.listProjects({ status: "ACTIVE" }));
    expect(active.items.map((p) => p.id)).toEqual([b.id, c.id]);
    const closed = data<{ items: Project[] }>(await store.listProjects({ status: "ARCHIVED" }));
    expect(closed.items.map((p) => p.id)).toEqual([a.id]);

    const page = data<{
      items: Project[];
      page: number;
      size: number;
      totalPages: number;
      hasNext: boolean;
    }>(await store.listProjects({ page: 1, size: 2 }));
    expect(page).toMatchObject({ page: 1, size: 2, totalPages: 2, hasNext: false });
    expect(page.items.map((p) => p.name)).toEqual(["C"]);

    expect(refusal(await store.listProjects({ status: "DONE" }))).toEqual([
      400,
      "UNSUPPORTED_PARAMETER",
    ]);
    expect(refusal(await store.listProjects({ size: 0 }))).toEqual([400, "UNSUPPORTED_PARAMETER"]);
  });
});

describe("design projects: adding and removing designs (BR-17)", () => {
  it("adds a design: it carries project {id, name, status}, its status stays and its version moves on, ADDED_TO_PROJECT is recorded", async () => {
    const store = await makeStore();
    const project = await newProject(store);
    const design = await draft(store);

    const added = await store.addToProject(project.id, { designId: design.id });
    expect(added.status).toBe(200);
    const after = data<DesignDto>(added);
    expect(after).toMatchObject({
      status: "DRAFT",
      version: design.version + 1, // the BE saves the draft (`DesignProjectService.join`)
      projectId: project.id,
      project: { id: project.id, name: "Quán Hoa", status: "ACTIVE" },
    });
    expect(design).toMatchObject({ projectId: null, project: null });
    expect(await designHistory(store, design.id)).toEqual(["CREATED", "ADDED_TO_PROJECT"]);
    expect(data<Project>(await store.getProject(project.id)).designCount).toBe(1);
    const listed = data<DesignDto[]>(await store.projectDesigns(project.id));
    expect(listed.map((d) => d.id)).toEqual([design.id]);
  });

  it("the design DTO of every read carries the project (GET, list)", async () => {
    const store = await makeStore();
    const project = await newProject(store);
    const design = await draft(store);
    await store.addToProject(project.id, { designId: design.id });
    await store.updateProject(project.id, { name: "Đổi tên", version: 0 });

    const got = data<DesignDto>(await store.get(design.id));
    expect(got.project).toEqual({ id: project.id, name: "Đổi tên", status: "ACTIVE" });
    const page = data<{ items: DesignDto[] }>(await store.list({ size: 200 }));
    expect(page.items.find((d) => d.id === design.id)?.project?.name).toBe("Đổi tên");
    expect(page.items.find((d) => d.id === MOCK_DESIGN_IDS.draft)?.project).toBeNull();
  });

  it("adding twice to the same project is idempotent; to another project is 422 DESIGN_IN_OTHER_PROJECT", async () => {
    const store = await makeStore();
    const one = await newProject(store, "Một");
    const two = await newProject(store, "Hai");
    const design = await draft(store);
    await store.addToProject(one.id, { designId: design.id });

    expect((await store.addToProject(one.id, { designId: design.id })).status).toBe(200);
    expect(await designHistory(store, design.id)).toEqual(["CREATED", "ADDED_TO_PROJECT"]);
    expect(refusal(await store.addToProject(two.id, { designId: design.id }))).toEqual([
      422,
      "DESIGN_IN_OTHER_PROJECT",
    ]);
  });

  it("refuses an ARCHIVED design (422 DESIGN_ARCHIVED), an unknown one (404) and a missing designId (422)", async () => {
    const store = await makeStore();
    const project = await newProject(store);
    expect(
      refusal(await store.addToProject(project.id, { designId: MOCK_DESIGN_IDS.archived })),
    ).toEqual([422, "DESIGN_ARCHIVED"]);
    expect(refusal(await store.addToProject(project.id, { designId: "nope" }))).toEqual([
      404,
      "NOT_FOUND",
    ]);
    expect(refusal(await store.addToProject(project.id, {}))).toEqual([422, "VALIDATION_FAILED"]);
    expect(refusal(await store.addToProject("nope", { designId: MOCK_DESIGN_IDS.draft }))).toEqual([
      404,
      "NOT_FOUND",
    ]);
  });

  it("holds at most 20 designs, ARCHIVED ones not counted: the 21st is 422 PROJECT_FULL", async () => {
    const store = await makeStore();
    const project = await newProject(store);
    const made: DesignDto[] = [];
    for (let i = 0; i < 20; i += 1) {
      const design = await draft(store, `Ly ${i}`);
      made.push(design);
      expect((await store.addToProject(project.id, { designId: design.id })).status).toBe(200);
    }
    expect(data<Project>(await store.getProject(project.id)).designCount).toBe(20);

    const extra = await draft(store, "Ly 21");
    expect(refusal(await store.addToProject(project.id, { designId: extra.id }))).toEqual([
      422,
      "PROJECT_FULL",
    ]);
    // POST /designs with the project id is gated the same way.
    expect(refusal(await store.create({ ...CUP12, name: "Ly 22", projectId: project.id }))).toEqual(
      [422, "PROJECT_FULL"],
    );

    // An ARCHIVED design is not counted: deleting one makes room.
    const first = data<DesignDto>(await store.get(made[0]!.id)); // its version moved when it joined
    expect((await store.remove(first.id, { version: first.version })).status).toBe(200);
    expect(data<Project>(await store.getProject(project.id)).designCount).toBe(19);
    const listed = data<DesignDto[]>(await store.projectDesigns(project.id));
    expect(listed.map((d) => d.id)).not.toContain(first.id);
    expect((await store.addToProject(project.id, { designId: extra.id })).status).toBe(200);
  });

  it("deleting a member draft moves the project's updatedAt and drops its preview", async () => {
    const store = await makeStore();
    const project = await newProject(store);
    // The seeded returned design is a DRAFT that was submitted once: it has a preview.
    await store.addToProject(project.id, { designId: MOCK_DESIGN_IDS.returned });
    const before = data<Project>(await store.getProject(project.id));
    expect(before.previewUrls.length).toBe(1);

    const returned = data<DesignDto>(await store.get(MOCK_DESIGN_IDS.returned));
    expect((await store.remove(returned.id, { version: returned.version })).status).toBe(200);
    const after = data<Project>(await store.getProject(project.id));
    expect(after.previewUrls).toEqual([]);
    expect(after.designCount).toBe(0);
    expect(after.updatedAt > before.updatedAt).toBe(true);
  });

  it("an ARCHIVED project takes no design (422 PROJECT_ARCHIVED)", async () => {
    const store = await makeStore();
    const project = await newProject(store);
    await store.archiveProject(project.id, { version: 0 });
    const design = await draft(store);
    expect(refusal(await store.addToProject(project.id, { designId: design.id }))).toEqual([
      422,
      "PROJECT_ARCHIVED",
    ]);
    expect(refusal(await store.create({ ...CUP12, name: "X", projectId: project.id }))).toEqual([
      422,
      "PROJECT_ARCHIVED",
    ]);
  });

  it("removes a design: ids cleared, REMOVED_FROM_PROJECT recorded, status stays and version moves on", async () => {
    const store = await makeStore();
    const project = await newProject(store);
    const design = await draft(store);
    await store.addToProject(project.id, { designId: design.id });

    const removed = await store.removeFromProject(project.id, design.id);
    expect(removed.status).toBe(200);
    expect(data<DesignDto>(removed)).toMatchObject({
      status: "DRAFT",
      version: design.version + 2, // joined (+1) and left (+1): each saves the draft
      projectId: null,
      project: null,
    });
    expect(await designHistory(store, design.id)).toEqual([
      "CREATED",
      "ADDED_TO_PROJECT",
      "REMOVED_FROM_PROJECT",
    ]);
    expect(data<Project>(await store.getProject(project.id)).designCount).toBe(0);
    // Not in the project any more: 404. It can join another project again.
    expect(refusal(await store.removeFromProject(project.id, design.id))).toEqual([
      404,
      "NOT_FOUND",
    ]);
    const other = await newProject(store, "Khác");
    expect((await store.addToProject(other.id, { designId: design.id })).status).toBe(200);
  });

  it("a PENDING_REVIEW design is not removed (409 DESIGN_PENDING); an APPROVED one is", async () => {
    const store = await makeStore();
    const project = await newProject(store);
    await store.addToProject(project.id, { designId: MOCK_DESIGN_IDS.pending });
    await store.addToProject(project.id, { designId: MOCK_DESIGN_IDS.approved });

    expect(refusal(await store.removeFromProject(project.id, MOCK_DESIGN_IDS.pending))).toEqual([
      409,
      "DESIGN_PENDING",
    ]);
    expect((await store.removeFromProject(project.id, MOCK_DESIGN_IDS.approved)).status).toBe(200);
  });

  it("previewUrls are the previews of the project's designs, at most 4", async () => {
    const store = await makeStore();
    const project = await newProject(store);
    // Seeded designs with a submitted preview: pending, approved; a fresh draft has none.
    await store.addToProject(project.id, { designId: MOCK_DESIGN_IDS.pending });
    await store.addToProject(project.id, { designId: MOCK_DESIGN_IDS.approved });
    const bare = await draft(store);
    await store.addToProject(project.id, { designId: bare.id });

    const got = data<Project>(await store.getProject(project.id));
    expect(got.designCount).toBe(3);
    expect(got.previewUrls.length).toBeGreaterThan(0);
    expect(got.previewUrls.length).toBeLessThanOrEqual(4);
    const designs = data<DesignDto[]>(await store.projectDesigns(project.id));
    expect(got.previewUrls).toEqual(designs.flatMap((d) => (d.previewUrl ? [d.previewUrl] : [])));
  });
});

describe("design projects: POST /designs with projectId", () => {
  it("creates the design in the project, with CREATED then ADDED_TO_PROJECT", async () => {
    const store = await makeStore();
    const project = await newProject(store);
    const created = await store.create({ ...CUP12, name: "Ly mới", projectId: project.id });
    expect(created.status).toBe(201);
    const design = data<DesignDto>(created);
    expect(design.project).toEqual({ id: project.id, name: "Quán Hoa", status: "ACTIVE" });
    expect(await designHistory(store, design.id)).toEqual(["CREATED", "ADDED_TO_PROJECT"]);
    expect(data<Project>(await store.getProject(project.id)).designCount).toBe(1);
  });

  it("an unknown project is 404 and nothing is created; a null or missing projectId is no project", async () => {
    const store = await makeStore();
    const before = data<{ drafts: number }>(await store.draftCount()).drafts;
    expect(refusal(await store.create({ ...CUP12, name: "X", projectId: "nope" }))).toEqual([
      404,
      "NOT_FOUND",
    ]);
    expect(refusal(await store.create({ ...CUP12, name: "X", projectId: 7 }))).toEqual([
      422,
      "VALIDATION_FAILED",
    ]);
    expect(data<{ drafts: number }>(await store.draftCount()).drafts).toBe(before);
    expect(
      data<DesignDto>(await store.create({ ...CUP12, name: "X", projectId: null })).project,
    ).toBeNull();
  });
});

describe("design projects: archiving (BR-22)", () => {
  it("closes an ACTIVE project: version + 1, PROJECT_ARCHIVED recorded, designs keep their state and the project", async () => {
    const store = await makeStore();
    const project = await newProject(store);
    const design = await draft(store);
    await store.addToProject(project.id, { designId: design.id });

    const closed = await store.archiveProject(project.id, { version: 0 });
    expect(closed.status).toBe(200);
    expect(data<Project>(closed)).toMatchObject({ status: "ARCHIVED", version: 1, designCount: 1 });
    const history = data<ProjectEvent[]>(await store.projectHistory(project.id));
    expect(history.map((e) => e.type)).toEqual(["PROJECT_CREATED", "PROJECT_ARCHIVED"]);
    expect(history[1]!.version).toBe(1);
    expect(data<DesignDto>(await store.get(design.id))).toMatchObject({
      status: "DRAFT",
      project: { id: project.id, status: "ARCHIVED" },
    });
  });

  it("a stale version is 409 VERSION_CONFLICT; a bad one is 422", async () => {
    const store = await makeStore();
    const project = await newProject(store);
    await store.updateProject(project.id, { name: "Mới", version: 0 });
    expect(refusal(await store.archiveProject(project.id, { version: 0 }))).toEqual([
      409,
      "VERSION_CONFLICT",
    ]);
    expect(refusal(await store.archiveProject(project.id, {}))).toEqual([422, "VALIDATION_FAILED"]);
  });

  it("is 409 PROJECT_HAS_PENDING while a design waits for review", async () => {
    const store = await makeStore();
    const project = await newProject(store);
    await store.addToProject(project.id, { designId: MOCK_DESIGN_IDS.pending });
    const refused = await store.archiveProject(project.id, { version: 0 });
    expect(refusal(refused)).toEqual([409, "PROJECT_HAS_PENDING"]);
    expect((refused.data as { details: { designIds: string[] } }).details.designIds).toEqual([
      MOCK_DESIGN_IDS.pending,
    ]);
    expect(data<Project>(await store.getProject(project.id)).status).toBe("ACTIVE");
  });

  it("is never reopened: archiving again, or editing a closed project, is 409 PROJECT_ARCHIVED", async () => {
    const store = await makeStore();
    const project = await newProject(store);
    await store.archiveProject(project.id, { version: 0 });
    expect(refusal(await store.archiveProject(project.id, { version: 1 }))).toEqual([
      409,
      "PROJECT_ARCHIVED",
    ]);
    expect(refusal(await store.updateProject(project.id, { name: "Mở lại", version: 1 }))).toEqual([
      409,
      "PROJECT_ARCHIVED",
    ]);
  });

  it("a closed project takes no removal (409 PROJECT_ARCHIVED)", async () => {
    const store = await makeStore();
    const project = await newProject(store);
    const design = await draft(store);
    await store.addToProject(project.id, { designId: design.id });
    await store.archiveProject(project.id, { version: 0 });
    expect(refusal(await store.removeFromProject(project.id, design.id))).toEqual([
      409,
      "PROJECT_ARCHIVED",
    ]);
  });
});

describe("design projects: a revision (BR-22)", () => {
  it("of a design in an ACTIVE project joins the same project, with ADDED_TO_PROJECT", async () => {
    const store = await makeStore();
    const project = await newProject(store);
    await store.addToProject(project.id, { designId: MOCK_DESIGN_IDS.approved });

    const revision = data<DesignDto>(await store.revise(MOCK_DESIGN_IDS.approved));
    expect(revision.project).toEqual({ id: project.id, name: "Quán Hoa", status: "ACTIVE" });
    expect(await designHistory(store, revision.id)).toEqual([
      "DERIVED_FROM_SNAPSHOT",
      "ADDED_TO_PROJECT",
    ]);
    expect(data<Project>(await store.getProject(project.id)).designCount).toBe(2);
  });

  it("of a design in an ARCHIVED project belongs to no project", async () => {
    const store = await makeStore();
    const project = await newProject(store);
    await store.addToProject(project.id, { designId: MOCK_DESIGN_IDS.approved });
    await store.archiveProject(project.id, { version: 0 });

    const revision = data<DesignDto>(await store.revise(MOCK_DESIGN_IDS.approved));
    expect(revision).toMatchObject({ projectId: null, project: null });
    expect(await designHistory(store, revision.id)).toEqual(["DERIVED_FROM_SNAPSHOT"]);
  });

  it("of a design whose project is full belongs to no project", async () => {
    const store = await makeStore();
    const project = await newProject(store);
    await store.addToProject(project.id, { designId: MOCK_DESIGN_IDS.approved });
    for (let i = 0; i < 19; i += 1) {
      const design = await draft(store, `Ly ${i}`);
      await store.addToProject(project.id, { designId: design.id });
    }
    const revision = data<DesignDto>(await store.revise(MOCK_DESIGN_IDS.approved));
    expect(revision.project).toBeNull();
  });
});

describe("design projects: stored data and routing", () => {
  it("is saved with the state: the project survives the store being opened again", async () => {
    const storage = createMemoryStorage();
    const first = await makeStore({ storage });
    const project = await newProject(first);
    const second = await makeStore({ storage });
    expect(data<Project>(await second.getProject(project.id)).name).toBe("Quán Hoa");
  });

  it.each([
    "/design-projects",
    "/design-projects/x",
    "/design-projects/x/designs/y",
    "/api/design-projects?status=ACTIVE",
    "/api/v1/design-projects/x/history",
    "http://localhost:3000/api/design-projects",
  ])("%s goes through the mock in design-only mode", (url) => {
    expect(isDesignMockPath(url)).toBe(true);
  });

  it("/design-projects-old does not", () => {
    expect(isDesignMockPath("/design-projects-old")).toBe(false);
  });
});
