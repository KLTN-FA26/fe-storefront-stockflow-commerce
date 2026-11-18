/**
 * The mock's design-project routes, in the BE's contract (`DesignProjectController`, origin/develop
 * 85e6036a): paths, shapes, statuses and error codes, over the rows of `mock-fixtures/design-store.ts`
 * (`mock-fixtures/design-be-projects.ts` turns them into the BE's answers). Registered by
 * `registerDesignMockRoutes` (`mock-design.ts`).
 */

import type { AxiosRequestConfig } from "axios";

import { bodyOf, blobPart, formOf, headerOf, param, queryParams } from "./mock-design-request";
import { beDraft, viaBe } from "./mock-fixtures/design-be-contract";
import {
  beProjectAsset,
  beProjectHistoryPage,
  beProjectResponse,
  beProjectSummary,
  beProjectText,
  designsOf,
  libraryOf,
  noContent,
} from "./mock-fixtures/design-be-projects";
import { printConfigFor } from "./mock-fixtures/design-print-configs";
import {
  asRecord,
  fail,
  fileRejected,
  invalid,
  ok,
  type DesignDto,
  type DesignEventDto,
  type MockResult,
  type ProjectDto,
  type ProjectEventDto,
} from "./mock-fixtures/design-rows";
import type { DesignMockStore } from "./mock-fixtures/design-store";

type Route = (
  method: string,
  pattern: string,
  run: (store: DesignMockStore, config: AxiosRequestConfig) => Promise<MockResult>,
) => void;

const draftOf = (design: DesignDto) =>
  beDraft(design, printConfigFor(design.product.slug, design.variant.sku)?.template.code);
const dataOf = (result: MockResult) => asRecord(asRecord(result.data).data);
const succeeded = (result: MockResult) => asRecord(result.data).success === true;
const nothing = () => null;

/** `DesignProjectResponse` of a project: its detail, its designs and its image count, in three reads of the store. */
async function projectAnswer(s: DesignMockStore, id: string, status = 200): Promise<MockResult> {
  const detail = await s.getProject(id);
  if (!succeeded(detail)) return viaBe(detail, nothing);
  const [designs, library] = await Promise.all([s.projectDesigns(id), s.listLibrary(id)]);
  const project = dataOf(detail) as unknown as ProjectDto;
  const assetCount = libraryOf(library).filter((item) => item.kind === "IMAGE").length;
  return viaBe(
    detail,
    () => beProjectResponse(project, designsOf(designs).map(draftOf), assetCount),
    { status },
  );
}

/** A write that answers the project afterwards: the store's own answer when it refused. */
async function thenProject(s: DesignMockStore, id: string, written: MockResult, status = 200) {
  return succeeded(written) ? projectAnswer(s, id, status) : viaBe(written, nothing);
}

export function registerProjectRoutes(route: Route): void {
  const id = (config: AxiosRequestConfig) => param(config, "id");

  route("GET", "/design-projects", async (s, config) =>
    viaBe(await s.listProjects(queryParams(config)), (page) => {
      const body = asRecord(page);
      const items = Array.isArray(body.items) ? (body.items as ProjectDto[]) : [];
      return { ...body, items: items.map(beProjectSummary) };
    }),
  );
  route("POST", "/design-projects", async (s, config) => {
    const created = await s.createProject(bodyOf(config));
    return succeeded(created)
      ? projectAnswer(s, String(dataOf(created).id), 201)
      : viaBe(created, nothing);
  });
  route("GET", "/design-projects/:id", (s, config) => projectAnswer(s, id(config)));
  route("PUT", "/design-projects/:id", async (s, config) => {
    // The BE takes the whole of it: a name is required.
    const body = asRecord(bodyOf(config));
    if (typeof body.name !== "string" || !body.name.trim()) {
      return viaBe(invalid("name", "name must not be blank"), nothing);
    }
    return thenProject(s, id(config), await s.updateProject(id(config), body));
  });
  route("POST", "/design-projects/:id/archive", async (s, config) =>
    thenProject(s, id(config), await s.archiveProject(id(config), bodyOf(config))),
  );
  route("POST", "/design-projects/:id/designs", async (s, config) =>
    thenProject(s, id(config), await s.addToProject(id(config), bodyOf(config))),
  );
  route("DELETE", "/design-projects/:id/designs/:designId", async (s, config) =>
    thenProject(s, id(config), await s.removeFromProject(id(config), param(config, "designId"))),
  );
  route("GET", "/design-projects/:id/history", async (s, config) => {
    const result = await s.projectHistory(id(config));
    return succeeded(result)
      ? beProjectHistoryPage(asRecord(result.data).data as ProjectEventDto[], queryParams(config))
      : viaBe(result, nothing);
  });

  /* ── Review rounds of a project ── */

  route("POST", "/design-projects/:id/review-rounds", async (s, config) => {
    const submitted = await s.submitBatch(id(config), bodyOf(config));
    if (!succeeded(submitted)) return viaBe(submitted, nothing);
    const project = await projectAnswer(s, id(config));
    return succeeded(project)
      ? ok({ roundId: dataOf(submitted).roundId, project: dataOf(project) }, 201)
      : project;
  });
  route("POST", "/design-projects/:id/preflight-failures", async (s, config) => {
    // Findings are `{rule, surfaceCode?, elementId?}`; the BE keeps those and ignores a message.
    const { items } = asRecord(bodyOf(config));
    const reported = Array.isArray(items) ? items.map(asRecord) : [];
    const valid =
      reported.length >= 1 &&
      reported.length <= 20 &&
      reported.every(
        (item) =>
          Array.isArray(item.issues) &&
          item.issues.length >= 1 &&
          item.issues.length <= 50 &&
          item.issues.map(asRecord).every((i) => typeof i.rule === "string" && i.rule.trim()),
      );
    if (!valid)
      return viaBe(invalid("items", "1 to 20 designs, each with 1 to 50 findings"), nothing);
    const kept = reported.map((item) => ({
      designId: item.designId,
      issues: (item.issues as unknown[]).map(asRecord).map((i) => ({
        ruleId: i.rule,
        level: "fail",
        message: String(i.rule),
        surfaceCode: i.surfaceCode,
        elementId: i.elementId,
      })),
    }));
    const recorded = await s.recordSetPreflightFailure(id(config), { items: kept });
    return viaBe(
      recorded,
      (event) => {
        const { type, note, at } = event as ProjectEventDto;
        return { event: type, notes: note, createdAt: at };
      },
      { status: 201 },
    );
  });

  /* ── The library: images and texts apart (F-33 … F-36) ── */

  // Quote requests over approved designs of the project (WF-02 D1, plan A-6, A-7): 201 / 200.
  const asIs = (data: unknown) => data;
  route("POST", "/design-projects/:id/quote-requests", async (s, config) =>
    viaBe(await s.requestProjectQuote(id(config), bodyOf(config)), asIs),
  );
  route("GET", "/design-projects/:id/quote-requests", async (s, config) =>
    viaBe(await s.projectQuoteRequests(id(config)), asIs),
  );
  route("GET", "/design-projects/:id/assets", async (s, config) =>
    viaBe(await s.listLibrary(id(config)), (items) =>
      (items as Parameters<typeof beProjectAsset>[0][])
        .map((item) => beProjectAsset(item, id(config)))
        .filter((asset) => asset !== null),
    ),
  );
  route("POST", "/design-projects/:id/assets", async (s, config) => {
    const file = blobPart(formOf(config), "file");
    if (!file) return viaBe(fileRejected("The file part is required"), nothing);
    const uploaded = await s.uploadLibraryImage(
      id(config),
      file,
      undefined,
      headerOf(config, "Idempotency-Key"),
    );
    return viaBe(uploaded, (item) => beProjectAsset(item as never, id(config)), { status: 201 });
  });
  route("POST", "/design-projects/:id/assets/from-design", async (s, config) =>
    viaBe(
      await s.saveLibraryImageFromDesign(id(config), bodyOf(config)),
      (item) => beProjectAsset(item as never, id(config)),
      { status: 201 },
    ),
  );
  route("GET", "/design-projects/:id/assets/:assetId/download-url", async (s, config) => {
    const library = await s.listLibrary(id(config));
    if (!succeeded(library)) return viaBe(library, nothing);
    const item = libraryOf(library).find((candidate) => candidate.id === param(config, "assetId"));
    if (!item || item.kind !== "IMAGE" || !item.previewUrl) {
      return fail(404, "NOT_FOUND", "Library file not found");
    }
    // An inline link to show the file from (no audit), short-lived like the BE's.
    return ok({
      url: item.previewUrl,
      expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    });
  });
  // The BE answers 404 for a text id on `/assets` and an image id on `/texts`.
  const deleteOfKind = async (
    s: DesignMockStore,
    config: AxiosRequestConfig,
    name: string,
    kind: "IMAGE" | "TEXT",
  ) => {
    const library = await s.listLibrary(id(config));
    if (!succeeded(library)) return viaBe(library, nothing);
    const item = libraryOf(library).find((candidate) => candidate.id === param(config, name));
    if (item && item.kind !== kind) return fail(404, "NOT_FOUND", "Library file not found");
    const removed = await s.deleteLibraryItem(id(config), param(config, name));
    return succeeded(removed) ? noContent() : viaBe(removed, nothing);
  };
  route("DELETE", "/design-projects/:id/assets/:assetId", (s, config) =>
    deleteOfKind(s, config, "assetId", "IMAGE"),
  );
  route("GET", "/design-projects/:id/texts", async (s, config) =>
    viaBe(await s.listLibrary(id(config)), (items) =>
      (items as Parameters<typeof beProjectText>[0][])
        .map((item) => beProjectText(item, id(config)))
        .filter((text) => text !== null),
    ),
  );
  route("POST", "/design-projects/:id/texts", async (s, config) =>
    viaBe(
      await s.saveLibraryText(id(config), bodyOf(config)),
      (item) => beProjectText(item as never, id(config)),
      { status: 201 },
    ),
  );
  route("DELETE", "/design-projects/:id/texts/:textId", (s, config) =>
    deleteOfKind(s, config, "textId", "TEXT"),
  );
}

/** The clone's answer in the BE's shape: the new design and why it is in no project. */
export function cloneAnswer(result: MockResult): MockResult {
  return viaBe(
    result,
    (data) => {
      const { design, notInProject } = asRecord(data);
      return { design: draftOf(design as DesignDto), notInProject };
    },
    { status: 201 },
  );
}

export type { DesignEventDto };
