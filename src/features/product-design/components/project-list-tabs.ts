import { parseAsInteger, parseAsStringLiteral } from "nuqs";

import type { DesignProject } from "../types";

export const PROJECT_TAB_IDS = ["active", "archived"] as const;
export type ProjectTab = (typeof PROJECT_TAB_IDS)[number];

/** A tab is a status of the project (spec 2026-11-12 §5): "Đang dùng" / "Đã đóng". */
export const PROJECT_TABS: Record<ProjectTab, { label: string; status: DesignProject["status"] }> =
  {
    active: { label: "Đang dùng", status: "ACTIVE" },
    archived: { label: "Đã đóng", status: "ARCHIVED" },
  };

export const toProjectTab = (value: string): ProjectTab =>
  PROJECT_TAB_IDS.find((id) => id === value) ?? "active";

/** The list's URL state (`nuqs`): the tab and the page, so a link opens the same view. */
export const projectListUrlState = {
  tab: parseAsStringLiteral(PROJECT_TAB_IDS).withDefault("active"),
  page: parseAsInteger.withDefault(1),
};
