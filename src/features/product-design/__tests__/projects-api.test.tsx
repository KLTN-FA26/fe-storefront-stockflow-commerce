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
  listProjectDesigns,
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
import {
  designProjectSchema,
  projectCreateInputSchema,
  projectUpdateInputSchema,
} from "../project-schemas";
import {
  designKeys,
  projectKeys,
  useProject,
  useProjectDesigns,
  useProjectHistory,
  useProjects,
} from "../queries";
import { designDtoSchema } from "../schemas";
import { eventView } from "../selectors";
import { designDto, ids } from "./fixtures";
import { projectDto } from "./project-fixtures";

afterEach(() => vi.restoreAllMocks());

const pid = ids.project;
const did = ids.design;
const inProject = designDto({
  projectId: pid,
  project: { id: pid, name: "Bộ ly", status: "ACTIVE" },
});

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

describe("the DTOs", () => {
  it("parses a project, with and without an open round", () => {
    expect(designProjectSchema.parse(projectDto()).openRound).toBeNull();
    const round = { id: ids.revision, designIds: [did], openedAt: "2026-11-11T09:00:00Z" };
    expect(designProjectSchema.parse(projectDto({ openRound: round })).openRound).toEqual(round);
  });

  it("refuses a project with a bad status, a missing field or more than 4 previews", () => {
    expect(designProjectSchema.safeParse(projectDto({ status: "OPEN" })).success).toBe(false);
    const { description: _omit, ...noDescription } = projectDto();
    expect(designProjectSchema.safeParse(noDescription).success).toBe(false);
    expect(
      designProjectSchema.safeParse(projectDto({ previewUrls: ["a", "b", "c", "d", "e"] })).success,
    ).toBe(false);
  });

  it("parses a design that carries its project, and refuses one without the field", () => {
    expect(designDtoSchema.parse(inProject).project).toEqual({
      id: pid,
      name: "Bộ ly",
      status: "ACTIVE",
    });
    const { project: _omit, ...noProject } = designDto();
    expect(designDtoSchema.safeParse(noProject).success).toBe(false);
    expect(
      designDtoSchema.safeParse(designDto({ project: { id: pid, name: "x", status: "OPEN" } }))
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
    expect(projectUpdateInputSchema.safeParse({}).success).toBe(false);
    expect(projectUpdateInputSchema.safeParse({ description: null }).success).toBe(true);
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

  it("describes the reason codes with their exact Vietnamese text", () => {
    const texts = {
      PROJECT_HAS_PENDING: "Còn bản đang chờ duyệt, chưa thể đóng dự án.",
      DESIGN_IN_OTHER_PROJECT: "Thiết kế này đã thuộc một dự án khác.",
      DESIGN_ARCHIVED: "Thiết kế đã bị xoá, không thể thêm vào dự án.",
      PROJECT_FULL: "Dự án đã đủ 20 bản.",
      PROJECT_ARCHIVED: "Dự án đã đóng.",
      DESIGN_PENDING: "Bản đang chờ duyệt, chưa thể gỡ khỏi dự án.",
    };
    for (const [code, text] of Object.entries(texts)) {
      expect(describeDesignError(new ApiError(422, code, "dev text"))).toBe(text);
    }
  });
});

describe("the API calls", () => {
  it("lists projects with a 0-based wire page and hands the page back 1-based", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValueOnce({
      data: {
        items: [projectDto()],
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
    expect(page.items[0]?.id).toBe(pid);
  });

  it("reads one project, its designs and its history", async () => {
    const get = vi
      .spyOn(api, "get")
      .mockResolvedValueOnce({ data: projectDto() })
      .mockResolvedValueOnce({ data: [designDto()] })
      .mockResolvedValueOnce({
        data: [{ type: "PROJECT_CREATED", at: "2026-11-10T08:00:00Z", version: 1, note: null }],
      });
    expect((await getProject(pid)).name).toBe("Bộ ly quán Hoa");
    expect(await listProjectDesigns(pid)).toHaveLength(1);
    expect((await getProjectHistory(pid))[0]?.type).toBe("PROJECT_CREATED");
    expect(get.mock.calls.map(([url]) => url)).toEqual([
      `/design-projects/${pid}`,
      `/design-projects/${pid}/designs`,
      `/design-projects/${pid}/history`,
    ]);
  });

  it("throws on an answer that breaks the contract", async () => {
    vi.spyOn(api, "get").mockResolvedValueOnce({ data: projectDto({ status: "OPEN" }) });
    await expect(getProject(pid)).rejects.toThrow();
  });

  it("sends the writes with their versions", async () => {
    const post = vi.spyOn(api, "post").mockResolvedValue({ data: projectDto() });
    const patch = vi.spyOn(api, "patch").mockResolvedValue({ data: projectDto() });
    await createProject({ name: " Bộ ly ", description: "mô tả" });
    await updateProject(pid, { name: "Mới", version: 4 });
    await archiveProject(pid, { version: 5 });
    expect(post).toHaveBeenNthCalledWith(1, "/design-projects", {
      name: "Bộ ly",
      description: "mô tả",
    });
    expect(patch).toHaveBeenCalledWith(`/design-projects/${pid}`, { name: "Mới", version: 4 });
    expect(post).toHaveBeenNthCalledWith(2, `/design-projects/${pid}/archive`, { version: 5 });
  });

  it("refuses an input the server would refuse, before sending it", async () => {
    const post = vi.spyOn(api, "post");
    await expect(createProject({ name: "" })).rejects.toThrow();
    expect(post).not.toHaveBeenCalled();
  });

  it("adds and removes a design", async () => {
    const post = vi.spyOn(api, "post").mockResolvedValueOnce({ data: inProject });
    const del = vi.spyOn(api, "delete").mockResolvedValueOnce({ data: designDto() });
    expect((await addDesignToProject(pid, did)).projectId).toBe(pid);
    expect((await removeDesignFromProject(pid, did)).projectId).toBeNull();
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
    for (const key of [
      projectKeys.designs(pid),
      projectKeys.library(pid),
      projectKeys.history(pid),
    ]) {
      expect(key.slice(0, detail.length)).toEqual(detail);
      expect(key).not.toEqual(detail);
    }
  });
});

describe("the read hooks", () => {
  it("read through the keys", async () => {
    vi.spyOn(api, "get").mockImplementation(async (url: string) => {
      if (url.endsWith("/designs")) return { data: [designDto()] };
      if (url.endsWith("/history")) return { data: [] };
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
      return { data: projectDto() };
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
  it("deleting a draft of a project refetches that project and its design list", async () => {
    const counts = { detail: 0, designs: 0 };
    vi.spyOn(api, "get").mockImplementation(async (url: string) => {
      if (url.endsWith("/designs")) {
        counts.designs += 1;
        return { data: [inProject] };
      }
      counts.detail += 1;
      return { data: projectDto({ designCount: 1 }) };
    });
    vi.spyOn(api, "delete").mockResolvedValueOnce({ data: designDto({ status: "ARCHIVED" }) });
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
    expect(counts).toEqual({ detail: 1, designs: 1 });

    result.current.remove.mutate({ id: did, version: 3 });

    await waitFor(() => expect(counts).toEqual({ detail: 2, designs: 2 }));
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
    vi.spyOn(api, "post").mockResolvedValueOnce({ data: designDto() });
    vi.spyOn(api, "patch").mockResolvedValueOnce({ data: designDto({ name: "Mới" }) });
    vi.spyOn(api, "delete").mockRejectedValueOnce(new ApiError(500, "INTERNAL_ERROR", "x"));
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
  it("useCreateProject re-reads the project lists", async () => {
    vi.spyOn(api, "post").mockResolvedValueOnce({ data: projectDto() });
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useCreateProject(), { wrapper });
    result.current.mutate({ name: "Bộ ly" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidated(invalidate)).toContainEqual({ queryKey: projectKeys.lists() });
  });

  it("useUpdateProject re-reads the project and the lists that show its name", async () => {
    vi.spyOn(api, "patch").mockResolvedValueOnce({ data: projectDto({ version: 2 }) });
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
    client.setQueryData(projectKeys.designs(pid), [inProject]);
    vi.spyOn(api, "patch").mockResolvedValueOnce({ data: projectDto({ version: 2 }) });
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
      new ApiError(409, "PROJECT_HAS_PENDING", "x", undefined, undefined, { designIds: [did] }),
    );
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useArchiveProject(pid), { wrapper });
    result.current.mutate({ version: 1 });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(invalidated(invalidate)).toContainEqual({ queryKey: projectKeys.detail(pid) });
  });

  it("useAddDesignToProject re-reads the project, the design and the lists", async () => {
    vi.spyOn(api, "post").mockResolvedValueOnce({ data: inProject });
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
    vi.spyOn(api, "delete").mockResolvedValueOnce({ data: designDto() });
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
    vi.spyOn(api, "post").mockRejectedValueOnce(new ApiError(422, "PROJECT_FULL", "x"));
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useAddDesignToProject(pid), { wrapper });
    result.current.mutate(did);
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(invalidated(invalidate)).toContainEqual({ queryKey: projectKeys.detail(pid) });
  });

  it("useUpdateProject re-reads the project when the write is refused", async () => {
    vi.spyOn(api, "patch").mockRejectedValueOnce(new ApiError(409, "VERSION_CONFLICT", "x"));
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useUpdateProject(pid), { wrapper });
    result.current.mutate({ name: "Mới", version: 1 });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(invalidated(invalidate)).toContainEqual({ queryKey: projectKeys.detail(pid) });
    expect(invalidated(invalidate)).toContainEqual({ queryKey: projectKeys.lists() });
  });

  it("useRemoveDesignFromProject re-reads the project when the write is refused", async () => {
    vi.spyOn(api, "delete").mockRejectedValueOnce(new ApiError(409, "DESIGN_PENDING", "x"));
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useRemoveDesignFromProject(pid), { wrapper });
    result.current.mutate(did);
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(invalidated(invalidate)).toContainEqual({ queryKey: projectKeys.detail(pid) });
  });

  it("useCreateDesign without a project leaves the project queries alone", async () => {
    vi.spyOn(api, "post").mockResolvedValueOnce({ data: designDto({ version: 0 }) });
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useCreateDesign(), { wrapper });
    result.current.mutate({ productSlug: "ly", sku: "CUP-1", name: "Ly" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const keys = invalidated(invalidate).map((f) => f?.queryKey?.[0]);
    expect(keys).not.toContain(projectKeys.all[0]);
    expect(keys).not.toContain(undefined);
  });

  it("useCreateDesign sends the project id and re-reads that project", async () => {
    const post = vi.spyOn(api, "post").mockResolvedValueOnce({ data: designDto({ version: 0 }) });
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useCreateDesign(), { wrapper });
    result.current.mutate({ productSlug: "ly", sku: "CUP-1", name: "Ly", projectId: pid });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(post).toHaveBeenCalledWith("/designs", {
      productSlug: "ly",
      sku: "CUP-1",
      name: "Ly",
      projectId: pid,
    });
    const keys = invalidated(invalidate);
    expect(keys).toContainEqual({ queryKey: projectKeys.detail(pid) });
    expect(keys).toContainEqual({ queryKey: projectKeys.lists() });
    expect(keys).toContainEqual({ queryKey: designKeys.lists() });
  });
});
