import { keepPreviousData, queryOptions, useQuery } from "@tanstack/react-query";

import { QUERY_TIMES } from "@/lib/api/query-client";
import { retryTransient } from "@/lib/api/retry";

import { getProject, getProjectHistory, listProjectLibrary, listProjects } from "./api";
import type { DesignProject, ProjectListParams } from "./types";

/** How often a design, or a project with a round open, is re-read while the review is awaited. */
export const DESIGN_POLL_MS = 5_000;

// The queries of design projects (spec 2026-11-12 §4), re-exported by `queries.ts`.

// A project's own data nests under `detail(id)` the same way: one invalidation re-reads the
// project (its designs come with it), its library and its history.
export const projectKeys = {
  all: ["design-projects"] as const,
  lists: () => [...projectKeys.all, "list"] as const,
  list: (p: ProjectListParams) => [...projectKeys.lists(), p] as const,
  details: () => [...projectKeys.all, "detail"] as const,
  detail: (id: string) => [...projectKeys.details(), id] as const,
  library: (id: string) => [...projectKeys.detail(id), "library"] as const,
  history: (id: string) => [...projectKeys.detail(id), "history"] as const,
};

/** The caller's projects, a tab and a page at a time. */
export function useProjects(params: ProjectListParams) {
  return useQuery({
    queryKey: projectKeys.list(params),
    queryFn: ({ signal }) => listProjects(params, signal),
    placeholderData: keepPreviousData, // no flash between pages or tabs
    retry: retryTransient,
    ...QUERY_TIMES.list,
  });
}

/** The query of one project with its designs (the BE's detail): `useProject` and `useProjectDesigns` read it. */
export function projectQuery(id: string) {
  return queryOptions({
    queryKey: projectKeys.detail(id),
    queryFn: ({ signal }) => getProject(id, signal),
    retry: retryTransient,
    ...QUERY_TIMES.detail,
  });
}

/** A round open: a reviewer's decision shows up without a reload, as a design's does. */
const roundOpen = (project: DesignProject | undefined) => Boolean(project?.openRound);

/** One project (a closed one is readable); a 404 is an error the page words itself. */
export function useProject(id: string) {
  return useQuery({
    ...projectQuery(id),
    refetchInterval: (query) => (roundOpen(query.state.data) ? DESIGN_POLL_MS : false),
    refetchOnWindowFocus: (query) => (roundOpen(query.state.data) ? "always" : true),
  });
}

/**
 * The designs inside a project (never ARCHIVED ones), newest updated first: the same read as the
 * project's own (F-30), so a page that shows both costs one request, not two.
 */
export function useProjectDesigns(id: string) {
  return useQuery({
    ...projectQuery(id),
    select: (project) => project.designs,
    refetchInterval: (query) => (roundOpen(query.state.data) ? DESIGN_POLL_MS : false),
    refetchOnWindowFocus: (query) => (roundOpen(query.state.data) ? "always" : true),
  });
}

/**
 * The previews of a project card (F-26): the BE's list has none, so each card reads its project's
 * detail (one request, cached and shared with the project's page). Empty until it is read, and
 * when it cannot be: the card then shows no strip, nothing more.
 */
export function useProjectPreviews(id: string): readonly string[] {
  const { data } = useQuery(projectQuery(id));
  return data?.previewUrls ?? [];
}

/** A project's library: images and text styles, newest first (a closed project's is readable). */
export function useProjectLibrary(id: string) {
  return useQuery({
    queryKey: projectKeys.library(id),
    queryFn: ({ signal }) => listProjectLibrary(id, signal),
    retry: retryTransient,
    ...QUERY_TIMES.detail,
  });
}

export function useProjectHistory(id: string) {
  return useQuery({
    queryKey: projectKeys.history(id),
    queryFn: ({ signal }) => getProjectHistory(id, signal),
    retry: retryTransient,
    ...QUERY_TIMES.detail,
  });
}
