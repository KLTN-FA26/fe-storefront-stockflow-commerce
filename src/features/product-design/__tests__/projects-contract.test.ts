import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/error";
import { printConfigFor } from "@/lib/api/mock-fixtures/design-print-configs";
import { MOCK_DESIGN_IDS } from "@/lib/api/mock-fixtures/design-seed";

import {
  addDesignToProject,
  archiveProject,
  createDesign,
  createProject,
  deleteLibraryItem,
  getDesignHistory,
  getProject,
  getProjectHistory,
  listDesignAssets,
  listProjectDesigns,
  listProjectLibrary,
  listProjects,
  placeFromLibrary,
  removeDesignFromProject,
  saveImageToLibrary,
  saveTextStyle,
  updateProject,
  uploadDesignAsset,
  uploadLibraryImage,
} from "../api";
import { describeDesignError, fileRuleOf } from "../errors";
import { textStyleSchema } from "../library-schemas";
import { textStyleDto } from "./project-fixtures";
import { pngBytes } from "../engine/__tests__/fixtures";
import { designBackend } from "./design-backend";

// The project API as the app serves it with the design mock on: the real client, the mock adapter
// and the design route table, read through the feature's own API functions (which parse every
// answer with the feature's zod schemas). A drift between `toProjectDto` / `toDesignDto` and
// `project-schemas.ts` fails here, not in a screen.

const { draft, returned, pending } = MOCK_DESIGN_IDS;

beforeEach(async () => {
  await designBackend();
});
afterEach(() => vi.restoreAllMocks());

describe("the project mock, read through the feature's API layer", () => {
  it("serves a project's list, detail, designs and history, and the designs' own history", async () => {
    const created = await createProject({ name: "Bộ ly quán Hoa", description: "Ba cỡ ly" });
    expect(created).toMatchObject({ status: "ACTIVE", designCount: 0, openRound: null });

    const joined = await addDesignToProject(created.id, draft);
    expect(joined.projectId).toBe(created.id);
    expect(joined.project).toEqual({ id: created.id, name: "Bộ ly quán Hoa", status: "ACTIVE" });
    await addDesignToProject(created.id, returned);

    const page = await listProjects({ page: 1, size: 12, status: "ACTIVE" });
    expect(page).toMatchObject({ page: 1, totalElements: 1 });
    expect(page.items[0]).toMatchObject({ id: created.id, designCount: 2 });

    const detail = await getProject(created.id);
    expect(detail.designCount).toBe(2);
    expect(detail.previewUrls.length).toBeLessThanOrEqual(4);

    const designs = await listProjectDesigns(created.id);
    expect(designs.map((d) => d.id).sort()).toEqual([draft, returned].sort());
    for (const d of designs) expect(d.project?.id).toBe(created.id);

    const renamed = await updateProject(created.id, { name: "Bộ ly mới", version: detail.version });
    expect(renamed.version).toBe(detail.version + 1);

    const left = await removeDesignFromProject(created.id, returned);
    expect(left).toMatchObject({ projectId: null, project: null });

    const closed = await archiveProject(created.id, { version: renamed.version });
    expect(closed.status).toBe("ARCHIVED");

    const events = await getProjectHistory(created.id);
    expect(events.map((e) => e.type)).toEqual(["PROJECT_CREATED", "PROJECT_ARCHIVED"]);

    const designEvents = await getDesignHistory(draft);
    expect(designEvents.map((e) => e.type)).toContain("ADDED_TO_PROJECT");
    const returnedEvents = await getDesignHistory(returned);
    expect(returnedEvents.map((e) => e.type)).toEqual(
      expect.arrayContaining(["ADDED_TO_PROJECT", "REMOVED_FROM_PROJECT"]),
    );
  });

  it("creates a design inside a project and parses its project field", async () => {
    const project = await createProject({ name: "Bộ túi" });
    const made = await createDesign({
      productSlug: "tui-giay-kraft",
      sku: "BAG-KRAFT-M",
      name: "Túi M",
      projectId: project.id,
    });
    expect(made.project?.id).toBe(project.id);
    expect((await getProject(project.id)).designCount).toBe(1);
  });

  it("answers a closed project's refusal with its reason code and message", async () => {
    const project = await createProject({ name: "Bộ cũ" });
    await archiveProject(project.id, { version: project.version });

    const refusal = await addDesignToProject(project.id, draft).catch((error: unknown) => error);

    expect(refusal).toBeInstanceOf(ApiError);
    expect(refusal).toMatchObject({ status: 422, code: "PROJECT_ARCHIVED" });
    expect(describeDesignError(refusal)).toContain("Dự án đã đóng.");
  });

  it("refuses to close a project while a design is under review, naming the design", async () => {
    const project = await createProject({ name: "Bộ chờ" });
    await addDesignToProject(project.id, pending);

    const refusal = await archiveProject(project.id, { version: project.version }).catch(
      (error: unknown) => error,
    );

    expect(refusal).toMatchObject({
      status: 409,
      code: "PROJECT_HAS_PENDING",
      details: { designIds: [pending] },
    });
  });
});

describe("the project library, read through the feature's API layer", () => {
  const png = (name = "logo.png") => new File([pngBytes(64, 48)], name, { type: "image/png" });
  const style = textStyleSchema.parse(
    textStyleDto({ outline: { color: "#FFFFFF", widthMm: 0.4 } }),
  );

  it("uploads, copies from a design, saves a text and lists them, every answer parsed", async () => {
    await designBackend();
    const project = await createProject({ name: "Bộ ly" });
    const uploaded = await uploadLibraryImage(project.id, png(), "logo.png", "k-1");
    expect(uploaded).toMatchObject({ kind: "IMAGE", name: "logo.png" });
    expect(uploaded.asset).toMatchObject({ contentType: "image/png" });
    expect(uploaded.previewUrl).toEqual(expect.stringContaining("blob:mock/"));

    await addDesignToProject(project.id, MOCK_DESIGN_IDS.approved);
    const seeded = (await listDesignAssets(MOCK_DESIGN_IDS.approved))[0]!;
    const copied = await saveImageToLibrary(project.id, {
      designId: MOCK_DESIGN_IDS.approved,
      assetId: seeded.assetId,
    });
    expect(copied.name).toBe(seeded.originalName);

    const text = await saveTextStyle(project.id, { text: "Cà phê Sáng", style });
    expect(text.style).toEqual(style);

    const items = await listProjectLibrary(project.id);
    expect(items.map((i) => i.id)).toEqual([text.id, copied.id, uploaded.id]);
    const events = await getProjectHistory(project.id);
    expect(events.map((e) => e.type)).toEqual([
      "PROJECT_CREATED",
      "ASSET_ADDED",
      "ASSET_ADDED",
      "ASSET_ADDED",
    ]);
  });

  it("places an item into a design, and deleting it afterwards leaves the design's image", async () => {
    await designBackend();
    const project = await createProject({ name: "Bộ ly" });
    const item = await uploadLibraryImage(project.id, png(), "logo.png", "k-2");
    await addDesignToProject(project.id, draft);

    const placed = await placeFromLibrary(draft, item.id);
    expect(placed).toMatchObject({ designId: draft, originalName: "logo.png" });
    expect(placed.assetId).not.toBe(item.id);

    const removed = await deleteLibraryItem(project.id, item.id);
    expect(removed).toMatchObject({ id: item.id, kind: "IMAGE" });
    expect(await listProjectLibrary(project.id)).toEqual([]);
    expect((await listDesignAssets(draft)).map((a) => a.assetId)).toContain(placed.assetId);
    expect((await getProjectHistory(project.id)).map((e) => e.type)).toContain("ASSET_REMOVED");
  });

  it("answers a refused library image with its reason code and message", async () => {
    await designBackend();
    const project = await createProject({ name: "Bộ ly" });
    const gif = new File([new Uint8Array([71, 73, 70])], "a.gif", { type: "image/gif" });

    const refusal = await uploadLibraryImage(project.id, gif, "a.gif", "k-3").catch(
      (error: unknown) => error,
    );

    expect(refusal).toMatchObject({ status: 422, code: "FILE_REJECTED" });
  });

  it("refuses to add to a closed project but still places from it", async () => {
    await designBackend();
    const project = await createProject({ name: "Bộ ly" });
    const item = await uploadLibraryImage(project.id, png(), "logo.png", "k-4");
    await addDesignToProject(project.id, draft);
    await archiveProject(project.id, { version: project.version });

    const refusal = await uploadLibraryImage(project.id, png("b.png"), "b.png", "k-5").catch(
      (error: unknown) => error,
    );
    expect(refusal).toMatchObject({ status: 422, code: "PROJECT_ARCHIVED" });
    const removal = await deleteLibraryItem(project.id, item.id).catch((error: unknown) => error);
    expect(removal).toMatchObject({ status: 409, code: "PROJECT_ARCHIVED" });
    expect(describeDesignError(removal)).toContain("Dự án đã đóng.");

    expect((await placeFromLibrary(draft, item.id)).originalName).toBe("logo.png");
  });

  it("refuses the 31st image with LIBRARY_FULL and words it", async () => {
    await designBackend();
    const project = await createProject({ name: "Bộ đầy" });
    for (let n = 0; n < 30; n += 1) {
      await uploadLibraryImage(project.id, png(`i${n}.png`), `i${n}.png`, `full-${n}`);
    }

    const refusal = await uploadLibraryImage(project.id, png("x.png"), "x.png", "full-x").catch(
      (error: unknown) => error,
    );

    expect(refusal).toMatchObject({ status: 422, code: "LIBRARY_FULL" });
    expect(describeDesignError(refusal)).toContain("30 ảnh");
  }, 60_000);

  it("names the rule of a FILE_RULE refusal in its details", async () => {
    await designBackend({
      printConfigFor: (slug, sku) => {
        const config = printConfigFor(slug, sku);
        return config
          ? { ...config, fileRules: { minDpi: 300, formats: ["image/jpeg"], maxFileSizeMb: 50 } }
          : null;
      },
    });
    const project = await createProject({ name: "Bộ ly" });
    const item = await uploadLibraryImage(project.id, png(), "logo.png", "k-6");
    await addDesignToProject(project.id, draft);

    const refusal = await placeFromLibrary(draft, item.id).catch((error: unknown) => error);

    expect(refusal).toMatchObject({ status: 422, code: "FILE_RULE" });
    expect(fileRuleOf(refusal)).toEqual({
      rule: "FORMAT",
      contentType: "image/png",
      formats: ["image/jpeg"],
    });
    expect(describeDesignError(refusal)).toBe("Quy cách này chỉ nhận ảnh JPG.");
    expect(await listDesignAssets(draft)).toEqual([]);
  });

  it("refuses a design outside the project with NOT_IN_PROJECT, in both directions, and words it", async () => {
    await designBackend();
    const project = await createProject({ name: "Bộ ly" });
    const item = await uploadLibraryImage(project.id, png(), "logo.png", "k-7");

    const place = await placeFromLibrary(draft, item.id).catch((error: unknown) => error);
    const [own] = await listDesignAssets(MOCK_DESIGN_IDS.approved);
    const copy = await saveImageToLibrary(project.id, {
      designId: MOCK_DESIGN_IDS.approved,
      assetId: own!.assetId,
    }).catch((error: unknown) => error);

    expect(place).toMatchObject({ status: 422, code: "NOT_IN_PROJECT" });
    expect(copy).toMatchObject({ status: 422, code: "NOT_IN_PROJECT" });
    expect(describeDesignError(place)).toContain("không thuộc dự án");
  });

  it("keeps uploading a design's own image working beside the library", async () => {
    await designBackend();
    const asset = await uploadDesignAsset(draft, png(), "own.png", "own-1");
    expect(asset.designId).toBe(draft);
  });
});
