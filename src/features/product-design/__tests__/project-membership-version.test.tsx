import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { settle } from "@/test/fake-backend";

import { useAddDesignToProject, useRemoveDesignFromProject } from "../project-mutations";
import { useDesign } from "../queries";
import { cupWithText, designBackend, type DesignBackend } from "./design-backend";

// Joining or leaving a project saves the draft in the BE, which moves its version (`DesignProjectService`):
// a studio open on the design in this tab must read the new version before its next autosave.

vi.setConfig({ testTimeout: 15_000 });

let backend: DesignBackend;
beforeEach(async () => {
  backend = await designBackend();
});
afterEach(() => vi.restoreAllMocks());

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

describe("a design joining or leaving a project", () => {
  it("moves its version in the mock, and the open design reads the new one after each write", async () => {
    const { store } = backend;
    const project = settle(await store.createProject({ name: "Quán Hoa" })).data as { id: string };
    const id = await cupWithText(store);
    const { wrapper } = setup();
    const { result: design } = renderHook(() => useDesign(id), { wrapper });
    await waitFor(() => expect(design.current.data).toBeDefined());
    const before = design.current.data!.version;
    const add = renderHook(() => useAddDesignToProject(project.id), { wrapper });
    const remove = renderHook(() => useRemoveDesignFromProject(project.id), { wrapper });

    add.result.current.mutate(id);

    // The detail is re-read: the studio's autosave adopts this version, not the one before.
    await waitFor(() => expect(design.current.data?.version).toBe(before + 1));
    expect(design.current.data?.projectId).toBe(project.id);

    remove.result.current.mutate(id);

    await waitFor(() => expect(design.current.data?.version).toBe(before + 2));
    expect(design.current.data?.projectId).toBeNull();
  });
});
