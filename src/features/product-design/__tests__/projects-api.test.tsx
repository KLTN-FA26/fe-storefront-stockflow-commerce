import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/error";

import {
  addDesignToProject,
  archiveProject,
  createProject,
  getProject,
  getProjectHistory,
  listProjects,
  removeDesignFromProject,
  updateProject,
} from "../api";
import { describeDesignError } from "../errors";
import {
  invalidateDesign,
  useAddDesignToProject,
  useArchiveProject,
  useCreateDesign,
  useCreateProject,
  useCreateRevision,
  useDeleteDesign,
  useRemoveDesignFromProject,
  useRenameDesign,
  useUpdateProject,
} from "../mutations";
import { projectCreateInputSchema, projectUpdateInputSchema } from "../project-schemas";
import {
  designKeys,
  projectKeys,
  useProject,
  useProjectDesigns,
  useProjectHistory,
  useProjects,
} from "../queries";
import { designSchema } from "../schemas";
import { eventView } from "../selectors";
import { designDraftDto, designDto, ids } from "./fixtures";
import {
  project as projectOf,
  projectDto,
  projectEventDto,
  projectSummaryDto,
} from "./project-fixtures";

afterEach(() => vi.restoreAllMocks());

const pid = ids.project;
const did = ids.design;
const inProject = designDto({
  projectId: pid,
  project: { id: pid, name: "Bộ ly", status: "ACTIVE" },
});
// The same design as the BE sends it, in a project's detail.
const memberDto = (overrides: Record<string, unknown> = {}) =>
  designDraftDto({ projectId: pid, ...overrides });

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, invalidate, wrapper };
}
const invalidated = (spy: ReturnType<typeof setup>["invalidate"]) =>
  spy.mock.calls.map(([filters]) => filters);

describe("the project mappers (F-26 … F-30)", () => {
  it("derives the previews and the open round from the project's designs, and the designs newest updated first", () => {
    const one = "7c1f0a00-0000-4000-8000-0000000000b1";
    const two = "7c1f0a00-0000-4000-8000-0000000000b2";
    const three = "7c1f0a00-0000-4000-8000-0000000000b3";
    const project = projectOf({
      designs: [
        memberDto({ id: one, previewUrl: "/a.png", updatedAt: "2026-11-01T08:00:00Z" }),
        memberDto({
          id: two,
          previewUrl: "/b.png",
          status: "PENDING_REVIEW",
          reviewRequestedAt: "2026-11-05T08:00:00Z",
          updatedAt: "2026-11-05T08:00:00Z",
        }),
        memberDto({
          id: three,
          status: "PENDING_REVIEW",
          reviewRequestedAt: "2026-11-04T08:00:00Z",
          updatedAt: "2026-11-04T09:00:00Z",
        }),
      ],
    });
    // F-30: newest updated first, each knowing the project it is in (F-8).
    expect(project.designs.map((d) => d.id)).toEqual([two, three, one]);
    expect(project.designs[0]?.project).toEqual({
      id: pid,
      name: "Bộ ly quán Hoa",
      status: "ACTIVE",
    });
    expect(project.designCount).toBe(3);
    // F-26: the first previews there are; F-27: the waiting designs, since the earliest request.
    expect(project.previewUrls).toEqual(["/b.png", "/a.png"]);
    expect(project.openRound).toEqual({
      designIds: [two, three],
      openedAt: "2026-11-04T08:00:00Z",
    });
  });

  it("keeps at most four previews, and has no round for a project with nothing waiting", () => {
    const designs = Array.from({ length: 6 }, (_, i) =>
      memberDto({
        id: `7c1f0a00-0000-4000-8000-00000000c00${i}`,
        previewUrl: `/p${i}.png`,
        updatedAt: `2026-11-0${i + 1}T08:00:00Z`,
      }),
    );
    const project = projectOf({ designs });
    expect(project.previewUrls).toHaveLength(4);
    expect(project.openRound).toBeNull();
    expect(projectOf().previewUrls).toEqual([]);
  });

  it("takes a project the BE sends with nothing omitted but its nulls: no description, no archivedAt", () => {
    expect(projectOf()).toMatchObject({
      description: null,
      archivedAt: null,
      status: "ACTIVE",
      version: 1,
    });
    expect(projectOf({ description: "Bộ ly", archivedAt: "2026-11-12T08:00:00Z" })).toMatchObject({
      description: "Bộ ly",
      archivedAt: "2026-11-12T08:00:00Z",
    });
  });

  it("refuses a project with a bad status", () => {
    expect(() => projectOf({ status: "OPEN" })).toThrow();
  });

  it("parses a design that carries its project, and refuses one without the field", () => {
    expect(designSchema.parse(inProject).project).toEqual({
      id: pid,
      name: "Bộ ly",
      status: "ACTIVE",
    });
    const { project: _omit, ...noProject } = designDto();
    expect(designSchema.safeParse(noProject).success).toBe(false);
    expect(
      designSchema.safeParse(designDto({ project: { id: pid, name: "x", status: "OPEN" } }))
        .success,
    ).toBe(false);
  });

  it("limits the inputs to 200 characters of name and 2,000 of description", () => {
    expect(projectCreateInputSchema.safeParse({ name: "a".repeat(200) }).success).toBe(true);
    expect(projectCreateInputSchema.safeParse({ name: "a".repeat(201) }).success).toBe(false);
    expect(projectCreateInputSchema.safeParse({ name: "   " }).success).toBe(false);
    expect(
      projectCreateInputSchema.safeParse({ name: "x", description: "d".repeat(2001) }).success,
    ).toBe(false);
    expect(projectCreateInputSchema.safeParse({ name: "x", description: null }).success).toBe(true);
    // The BE takes the whole of an update: the name is always there (F-29).
    expect(projectUpdateInputSchema.safeParse({}).success).toBe(false);
    expect(projectUpdateInputSchema.safeParse({ description: null }).success).toBe(false);
    expect(projectUpdateInputSchema.safeParse({ name: "x", description: null }).success).toBe(true);
    expect(projectUpdateInputSchema.safeParse({ name: "a".repeat(201) }).success).toBe(false);
  });

  it("labels the new design events in Vietnamese", () => {
    const at = "2026-11-11T09:00:00Z";
    expect(eventView({ type: "ADDED_TO_PROJECT", at, version: 1, note: "Bộ ly" }).label).toBe(
      "Thêm vào dự án",
    );
    expect(eventView({ type: "REMOVED_FROM_PROJECT", at, version: 1, note: null }).label).toBe(
      "Gỡ khỏi dự án",
    );
  });

  it("describes the BE's reason codes with their exact Vietnamese text", () => {
    const texts = {
      DESIGN_PROJECT_HAS_PENDING: "Còn bản đang chờ duyệt, chưa thể đóng dự án.",
      DESIGN_IN_ANOTHER_PROJECT: "Thiết kế này đã thuộc một dự án khác.",
      DESIGN_PROJECT_FULL: "Dự án đã đủ 20 bản.",
      DESIGN_PROJECT_ARCHIVED: "Dự án đã đóng.",
      DESIGN_PENDING_IN_PROJECT: "Bản đang chờ duyệt, chưa thể gỡ khỏi dự án.",
    };
    for (const [code, text] of Object.entries(texts)) {
      expect(describeDesignError(new ApiError(409, code, "dev text"))).toBe(text);
    }
    // An archived design is simply not found (404), as the BE says.
    expect(describeDesignError(new ApiError(404, "NOT_FOUND", "dev text"))).toBe(
      "Không tìm thấy thiết kế hoặc sản phẩm này.",
    );
  });
});

describe("the API calls", () => {
  it("lists projects with a 0-based wire page, as summaries, and hands the page back 1-based", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValueOnce({
      data: {
        items: [projectSummaryDto({ designCount: 3 })],
        page: 0,
        size: 12,
        totalElements: 1,
        totalPages: 1,
        hasNext: false,
        hasPrevious: false,
      },
    });
    const page = await listProjects({ page: 1, size: 12, status: "ACTIVE" });
    expect(get).toHaveBeenCalledWith("/design-projects", {
      params: { page: 0, size: 12, status: "ACTIVE" },
    });
    expect(page.page).toBe(1);
    expect(page.items[0]).toEqual({
      id: pid,
      name: "Bộ ly quán Hoa",
      description: null,
      status: "ACTIVE",
      version: 1,
      designCount: 3,
      createdAt: "2026-11-10T08:00:00Z",
      archivedAt: null,
    });
    // No previews and no round on a row (F-26, F-27): a card reads its project's detail.
    expect(page.items[0]).not.toHaveProperty("previewUrls");
    expect(page.items[0]).not.toHaveProperty("openRound");
  });

  it("reads one project with its designs in a single request (F-30), and its history, every page, oldest first", async () => {
    const get = vi
      .spyOn(api, "get")
      .mockResolvedValueOnce({ data: projectDto({ designs: [memberDto()] }) })
      .mockResolvedValueOnce({
        data: {
          items: [projectEventDto({ event: "TEXT_ADDED", createdAt: "2026-11-12T08:00:00Z" })],
          page: 0,
          size: 200,
          totalElements: 2,
          totalPages: 2,
          hasNext: true,
          hasPrevious: false,
        },
      })
      .mockResolvedValueOnce({
        data: {
          items: [projectEventDto()],
          page: 1,
          size: 200,
          totalElements: 2,
          totalPages: 2,
          hasNext: false,
          hasPrevious: true,
        },
      });
    const project = await getProject(pid);
    expect(project.name).toBe("Bộ ly quán Hoa");
    expect(project.designs).toHaveLength(1);
    const history = await getProjectHistory(pid);
    // Newest first on the wire, oldest first for the screens; a `version` is not there (F-16).
    expect(history.map((e) => e.type)).toEqual(["PROJECT_CREATED", "TEXT_ADDED"]);
    expect(history[0]).toEqual({ type: "PROJECT_CREATED", at: "2026-11-10T08:00:00Z", note: null });
    expect(get.mock.calls.map(([url]) => url)).toEqual([
      `/design-projects/${pid}`,
      `/design-projects/${pid}/history`,
      `/design-projects/${pid}/history`,
    ]);
    expect(get.mock.calls[1]![1]).toMatchObject({ params: { page: 0, size: 200 } });
  });

  it("does not fail the history on an event it does not know: it reads as OTHER", async () => {
    vi.spyOn(api, "get").mockResolvedValueOnce({
      data: {
        items: [
          projectEventDto({ event: "PROJECT_QUOTE_REQUESTED", notes: "n" }),
          projectEventDto({ event: "A_FUTURE_EVENT" }),
        ],
        page: 0,
        size: 200,
        totalElements: 2,
        totalPages: 1,
        hasNext: false,
        hasPrevious: false,
      },
    });
    expect((await getProjectHistory(pid)).map((e) => e.type)).toEqual([
      "OTHER",
      "PROJECT_QUOTE_REQUESTED",
    ]);
  });

  it("throws on an answer that breaks the contract", async () => {
    vi.spyOn(api, "get").mockResolvedValueOnce({ data: projectDto({ status: "OPEN" }) });
    await expect(getProject(pid)).rejects.toThrow();
  });

  it("sends the writes with their versions: PUT with the name, POST archive", async () => {
    const post = vi.spyOn(api, "post").mockResolvedValue({ data: projectDto() });
    const put = vi.spyOn(api, "put").mockResolvedValue({ data: projectDto() });
    await createProject({ name: " Bộ ly ", description: "mô tả" });
    await updateProject(pid, { name: "Mới", version: 4 });
    await updateProject(pid, { name: "Mới", description: null, version: 5 });
    await archiveProject(pid, { version: 5 });
    expect(post).toHaveBeenNthCalledWith(1, "/design-projects", {
      name: "Bộ ly",
      description: "mô tả",
    });
    expect(put).toHaveBeenNthCalledWith(1, `/design-projects/${pid}`, { name: "Mới", version: 4 });
    expect(put).toHaveBeenNthCalledWith(2, `/design-projects/${pid}`, {
      name: "Mới",
      description: null,
      version: 5,
    });
    expect(post).toHaveBeenNthCalledWith(2, `/design-projects/${pid}/archive`, { version: 5 });
  });

  it("refuses an input the server would refuse, before sending it", async () => {
    const post = vi.spyOn(api, "post");
    const put = vi.spyOn(api, "put");
    await expect(createProject({ name: "" })).rejects.toThrow();
    await expect(updateProject(pid, { name: " ", version: 1 })).rejects.toThrow();
    expect(post).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
  });

  it("adds and removes a design: the BE answers the project (F-31), the design in or out of its designs", async () => {
    const post = vi
      .spyOn(api, "post")
      .mockResolvedValueOnce({ data: projectDto({ designs: [memberDto()] }) });
    const del = vi.spyOn(api, "delete").mockResolvedValueOnce({ data: projectDto() });
    const added = await addDesignToProject(pid, did);
    expect(added.designs.map((d) => d.id)).toEqual([did]);
    expect(added.designs[0]?.projectId).toBe(pid);
    const removed = await removeDesignFromProject(pid, did);
    expect(removed.designs).toEqual([]);
    expect(post).toHaveBeenCalledWith(`/design-projects/${pid}/designs`, { designId: did });
    expect(del).toHaveBeenCalledWith(`/design-projects/${pid}/designs/${did}`);
  });
});

describe("projectKeys", () => {
  it("nests a project's data under detail(id)", () => {
    expect(projectKeys.all).toEqual(["design-projects"]);
    expect(projectKeys.list({ page: 1, size: 12 })).toEqual([
      ...projectKeys.lists(),
      { page: 1, size: 12 },
    ]);
    const detail = projectKeys.detail(pid);
    expect(detail).toEqual([...projectKeys.details(), pid]);
    // The designs come with the project: no key of their own.
    for (const key of [projectKeys.library(pid), projectKeys.history(pid)]) {
      expect(key.slice(0, detail.length)).toEqual(detail);
      expect(key).not.toEqual(detail);
    }
  });
});

describe("the read hooks", () => {
  it("read through the keys", async () => {
    vi.spyOn(api, "get").mockImplementation(async (url: string) => {
      if (url.endsWith("/history")) {
        return {
          data: {
            items: [],
            page: 0,
            size: 200,
            totalElements: 0,
            totalPages: 0,
            hasNext: false,
            hasPrevious: false,
          },
        };
      }
      if (url === "/design-projects") {
        return {
          data: {
            items: [],
            page: 0,
            size: 12,
            totalElements: 0,
            totalPages: 0,
            hasNext: false,
            hasPrevious: false,
          },
        };
      }
      return { data: projectDto({ designs: [memberDto()] }) };
    });
    const { wrapper } = setup();
    const { result } = renderHook(
      () => ({
        list: useProjects({ page: 1, size: 12 }),
        one: useProject(pid),
        designs: useProjectDesigns(pid),
        history: useProjectHistory(pid),
      }),
      { wrapper },
    );
    await waitFor(() => {
      expect(result.current.list.isSuccess).toBe(true);
      expect(result.current.one.data?.id).toBe(pid);
      expect(result.current.designs.data).toHaveLength(1);
      expect(result.current.history.data).toEqual([]);
    });
  });
});

describe("a write on a design re-reads the projects (a project follows its designs)", () => {
  it("deleting a draft of a project refetches that project, designs included (one read)", async () => {
    let reads = 0;
    vi.spyOn(api, "get").mockImplementation(async () => {
      reads += 1;
      return { data: projectDto({ designs: [memberDto()] }) };
    });
    vi.spyOn(api, "post").mockResolvedValueOnce({ data: designDraftDto({ status: "ARCHIVED" }) });
    const { wrapper } = setup();
    const { result } = renderHook(
      () => ({
        project: useProject(pid),
        designs: useProjectDesigns(pid),
        remove: useDeleteDesign(),
      }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.designs.isSuccess).toBe(true));
    expect(reads).toBe(1);

    result.current.remove.mutate({ id: did, version: 3 });

    await waitFor(() => expect(reads).toBe(2));
  });

  it.each([["invalidateDesign", (client: QueryClient) => invalidateDesign(client, did)]])(
    "%s re-reads every project query",
    async (_name, run) => {
      const { client, invalidate } = setup();
      await run(client);
      expect(invalidated(invalidate)).toContainEqual({ queryKey: projectKeys.all });
    },
  );

  it("a revision, a rename and a refused delete re-read the projects too", async () => {
    // The revision and the (refused) archive are both POSTs, in the order they run.
    vi.spyOn(api, "post")
      .mockResolvedValueOnce({ data: designDraftDto() })
      .mockRejectedValueOnce(new ApiError(500, "INTERNAL_ERROR", "x"));
    vi.spyOn(api, "put").mockResolvedValueOnce({ data: designDraftDto({ name: "Mới" }) });
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(
      () => ({
        revise: useCreateRevision(),
        rename: useRenameDesign(did),
        remove: useDeleteDesign(),
      }),
      { wrapper },
    );
    for (const run of [
      () => result.current.revise.mutate(did),
      () => result.current.rename.mutate({ name: "Mới", version: 1 }),
      () => result.current.remove.mutate({ id: did, version: 1 }),
    ]) {
      invalidate.mockClear();
      run();
      await waitFor(() =>
        expect(invalidated(invalidate)).toContainEqual({ queryKey: projectKeys.all }),
      );
    }
  });
});

describe("the write hooks re-read what changed (spec §4)", () => {
  // What a product's customization read answers (F-12): the id and the template's code by SKU.
  const customization = { productId: did, templates: [{ code: "CUP1-BODY", sku: "CUP-1" }] };

  it("useCreateProject re-reads the project lists", async () => {
    vi.spyOn(api, "post").mockResolvedValueOnce({ data: projectDto() });
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useCreateProject(), { wrapper });
    result.current.mutate({ name: "Bộ ly" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidated(invalidate)).toContainEqual({ queryKey: projectKeys.lists() });
  });

  it("useUpdateProject re-reads the project and the lists that show its name", async () => {
    vi.spyOn(api, "put").mockResolvedValueOnce({ data: projectDto({ version: 2 }) });
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useUpdateProject(pid), { wrapper });
    result.current.mutate({ name: "Mới", version: 1 });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const keys = invalidated(invalidate);
    expect(keys).toContainEqual({ queryKey: projectKeys.detail(pid) });
    expect(keys).toContainEqual({ queryKey: projectKeys.lists() });
    expect(keys).toContainEqual({ queryKey: designKeys.lists() });
  });

  it("useUpdateProject and useArchiveProject re-read the cached details of the project's designs, exactly", async () => {
    const { client, invalidate, wrapper } = setup();
    client.setQueryData(
      projectKeys.detail(pid),
      projectOf({ designs: [memberDto({ id: inProject.id })] }),
    );
    vi.spyOn(api, "put").mockResolvedValueOnce({ data: projectDto({ version: 2 }) });
    vi.spyOn(api, "post").mockResolvedValueOnce({ data: projectDto({ status: "ARCHIVED" }) });
    const rename = renderHook(() => useUpdateProject(pid), { wrapper });
    rename.result.current.mutate({ name: "Mới", version: 1 });
    await waitFor(() => expect(rename.result.current.isSuccess).toBe(true));
    const detail = { queryKey: designKeys.detail(inProject.id), exact: true };
    expect(invalidated(invalidate)).toContainEqual(detail);
    invalidate.mockClear();

    const close = renderHook(() => useArchiveProject(pid), { wrapper });
    close.result.current.mutate({ version: 2 });
    await waitFor(() => expect(close.result.current.isSuccess).toBe(true));
    expect(invalidated(invalidate)).toContainEqual(detail);
    // Never the whole `details()` prefix: the editor owns the document query under it.
    expect(invalidated(invalidate)).not.toContainEqual({ queryKey: designKeys.details() });
  });

  it("useArchiveProject re-reads the project and both lists", async () => {
    vi.spyOn(api, "post").mockResolvedValueOnce({ data: projectDto({ status: "ARCHIVED" }) });
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useArchiveProject(pid), { wrapper });
    result.current.mutate({ version: 1 });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const keys = invalidated(invalidate);
    expect(keys).toContainEqual({ queryKey: projectKeys.detail(pid) });
    expect(keys).toContainEqual({ queryKey: projectKeys.lists() });
    expect(keys).toContainEqual({ queryKey: designKeys.lists() });
  });

  it("useArchiveProject re-reads the project when it is refused", async () => {
    vi.spyOn(api, "post").mockRejectedValueOnce(
      new ApiError(409, "DESIGN_PROJECT_HAS_PENDING", "x"),
    );
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useArchiveProject(pid), { wrapper });
    result.current.mutate({ version: 1 });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(invalidated(invalidate)).toContainEqual({ queryKey: projectKeys.detail(pid) });
  });

  it("useAddDesignToProject re-reads the project, the design and the lists", async () => {
    vi.spyOn(api, "post").mockResolvedValueOnce({ data: projectDto({ designs: [memberDto()] }) });
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useAddDesignToProject(pid), { wrapper });
    result.current.mutate(did);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const keys = invalidated(invalidate);
    expect(keys).toContainEqual({ queryKey: projectKeys.detail(pid) });
    expect(keys).toContainEqual({ queryKey: projectKeys.lists() });
    expect(keys).toContainEqual({ queryKey: designKeys.lists() });
    expect(keys).toContainEqual({ queryKey: designKeys.detail(did), exact: true });
    expect(keys).toContainEqual({ queryKey: designKeys.history(did) });
  });

  it("useRemoveDesignFromProject re-reads the project, the design and the lists", async () => {
    vi.spyOn(api, "delete").mockResolvedValueOnce({ data: projectDto() });
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useRemoveDesignFromProject(pid), { wrapper });
    result.current.mutate(did);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const keys = invalidated(invalidate);
    expect(keys).toContainEqual({ queryKey: projectKeys.detail(pid) });
    expect(keys).toContainEqual({ queryKey: projectKeys.lists() });
    expect(keys).toContainEqual({ queryKey: designKeys.lists() });
    expect(keys).toContainEqual({ queryKey: designKeys.detail(did), exact: true });
    expect(keys).toContainEqual({ queryKey: designKeys.history(did) });
  });

  it("useAddDesignToProject re-reads the project when the server refuses the add", async () => {
    vi.spyOn(api, "post").mockRejectedValueOnce(new ApiError(409, "DESIGN_PROJECT_FULL", "x"));
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useAddDesignToProject(pid), { wrapper });
    result.current.mutate(did);
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(invalidated(invalidate)).toContainEqual({ queryKey: projectKeys.detail(pid) });
  });

  it("useUpdateProject re-reads the project when the write is refused", async () => {
    vi.spyOn(api, "put").mockRejectedValueOnce(new ApiError(409, "CONFLICT", "x"));
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useUpdateProject(pid), { wrapper });
    result.current.mutate({ name: "Mới", version: 1 });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(invalidated(invalidate)).toContainEqual({ queryKey: projectKeys.detail(pid) });
    expect(invalidated(invalidate)).toContainEqual({ queryKey: projectKeys.lists() });
  });

  it("useRemoveDesignFromProject re-reads the project when the write is refused", async () => {
    vi.spyOn(api, "delete").mockRejectedValueOnce(
      new ApiError(409, "DESIGN_PENDING_IN_PROJECT", "x"),
    );
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useRemoveDesignFromProject(pid), { wrapper });
    result.current.mutate(did);
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(invalidated(invalidate)).toContainEqual({ queryKey: projectKeys.detail(pid) });
  });

  it("useCreateDesign without a project leaves the project queries alone", async () => {
    vi.spyOn(api, "get").mockResolvedValueOnce({ data: customization });
    vi.spyOn(api, "post").mockResolvedValueOnce({ data: designDraftDto({ version: 0 }) });
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useCreateDesign(), { wrapper });
    result.current.mutate({ productSlug: "ly", sku: "CUP-1", name: "Ly" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const keys = invalidated(invalidate).map((f) => f?.queryKey?.[0]);
    expect(keys).not.toContain(projectKeys.all[0]);
    expect(keys).not.toContain(undefined);
  });

  it("useCreateDesign sends the project id and re-reads that project", async () => {
    vi.spyOn(api, "get").mockResolvedValueOnce({ data: customization });
    const post = vi
      .spyOn(api, "post")
      .mockResolvedValueOnce({ data: designDraftDto({ version: 0, projectId: pid }) });
    vi.spyOn(api, "get").mockResolvedValue({ data: projectDto() }); // the project the design is in
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useCreateDesign(), { wrapper });
    result.current.mutate({ productSlug: "ly", sku: "CUP-1", name: "Ly", projectId: pid });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(post).toHaveBeenCalledWith("/designs/mine", {
      productId: did,
      sku: "CUP-1",
      templateCode: "CUP1-BODY",
      name: "Ly",
      projectId: pid,
    });
    const keys = invalidated(invalidate);
    expect(keys).toContainEqual({ queryKey: projectKeys.detail(pid) });
    expect(keys).toContainEqual({ queryKey: projectKeys.lists() });
    expect(keys).toContainEqual({ queryKey: designKeys.lists() });
  });
});
