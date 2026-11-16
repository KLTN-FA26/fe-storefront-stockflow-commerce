import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";

import {
  addDesignToProject,
  archiveProject,
  createProject,
  removeDesignFromProject,
  updateProject,
} from "./api";
import { designKeys, projectKeys } from "./queries";
import type { ArchiveProjectInput, DesignProject, UpdateProjectInput } from "./types";

// The writes on projects (spec 2026-11-12 §4), re-exported by `mutations.ts`: a change to a
// project re-reads the project; adding or removing a design also re-reads that design (its
// project label, its history). Adding or removing saves the draft in the BE, which moves its
// version: the design's detail is re-read, so a studio open on it in this tab adopts the new
// version (R69) before its next autosave; another tab's autosave meets a 409 and its reload offer.

/**
 * A project changed, or a write to it was refused (so what the page shows is stale): the project
 * with its designs, library and history, and the project lists.
 */
export const reReadProject = (client: QueryClient, projectId: string) =>
  Promise.all([
    client.invalidateQueries({ queryKey: projectKeys.detail(projectId) }),
    client.invalidateQueries({ queryKey: projectKeys.lists() }),
  ]);

/**
 * The cached details of the project's designs, read afresh: their `project` label (name, status)
 * is the project's, so the studio header and the library gates would show the old one. Exact keys
 * only: the editor owns the document query, which sits under the same prefix. Only the designs
 * the project page loaded are known, which are the ones a customer can reach it from.
 */
const reReadProjectDesigns = (client: QueryClient, projectId: string) =>
  Promise.all(
    (client.getQueryData<DesignProject>(projectKeys.detail(projectId))?.designs ?? []).map(
      (design) => client.invalidateQueries({ queryKey: designKeys.detail(design.id), exact: true }),
    ),
  );

/**
 * Every project query, for a write on a design that may belong to one (delete, submit, a review's
 * answer, a revision): a project's count, previews and gates follow its designs. There are few
 * project queries, so the whole prefix is cheaper than finding the design's project.
 */
export const reReadProjects = (client: QueryClient) =>
  client.invalidateQueries({ queryKey: projectKeys.all });

/** POST /design-projects. The caller opens the page of the project it gets back. */
export function useCreateProject() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: createProject,
    onSuccess: () => client.invalidateQueries({ queryKey: projectKeys.lists() }),
  });
}

/**
 * Renames the project or edits its description (`mutate({ name?, description?, version })`). The
 * design lists and the project's cached designs are re-read too: their cards and the studio
 * header carry the project's name.
 */
export function useUpdateProject(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateProjectInput) => updateProject(id, input),
    onSuccess: () =>
      Promise.all([
        reReadProject(client, id),
        reReadProjectDesigns(client, id),
        client.invalidateQueries({ queryKey: designKeys.lists() }),
      ]),
    onError: () => reReadProject(client, id), // a stale version, or the project was closed
  });
}

/**
 * Closes the project for good (`mutate({ version })`, docs 12 BR-22). Its designs now say their
 * project is closed, so the design lists are re-read as well. A refusal (DESIGN_PROJECT_HAS_PENDING, a
 * stale version) re-reads the project: what the page showed was out of date.
 */
export function useArchiveProject(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: ArchiveProjectInput) => archiveProject(id, input),
    onSuccess: () =>
      Promise.all([
        reReadProject(client, id),
        reReadProjectDesigns(client, id),
        client.invalidateQueries({ queryKey: designKeys.lists() }),
      ]),
    onError: () => reReadProject(client, id),
  });
}

/** Re-reads a design that joined or left a project, and the project it joined or left. */
const reReadMembership = (client: QueryClient, projectId: string, designId: string) =>
  Promise.all([
    reReadProject(client, projectId),
    client.invalidateQueries({ queryKey: designKeys.detail(designId), exact: true }),
    client.invalidateQueries({ queryKey: designKeys.history(designId) }),
    client.invalidateQueries({ queryKey: designKeys.lists() }),
  ]);

/** Puts an existing design in the project (`mutate(designId)`, docs 12 BR-17). */
export function useAddDesignToProject(projectId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (designId: string) => addDesignToProject(projectId, designId),
    onSuccess: (_design, designId) => reReadMembership(client, projectId, designId),
    onError: () => reReadProject(client, projectId), // full, closed, or the design moved meanwhile
  });
}

/** Takes a design out of the project (`mutate(designId)`); the design stays, on its own. */
export function useRemoveDesignFromProject(projectId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (designId: string) => removeDesignFromProject(projectId, designId),
    onSuccess: (_design, designId) => reReadMembership(client, projectId, designId),
    onError: () => reReadProject(client, projectId), // under review meanwhile, or the project closed
  });
}
