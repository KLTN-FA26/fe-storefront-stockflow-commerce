import { parseAsInteger, parseAsStringLiteral } from "nuqs";

import type { DesignStatus } from "../types";

export const TAB_IDS = ["all", "drafts", "pending", "approved"] as const;
export type Tab = (typeof TAB_IDS)[number];

/** A tab is a status of the docs' lifecycle (spec §6.3); ARCHIVED is never listed. */
export const TABS: Record<Tab, { label: string; status: DesignStatus | undefined }> = {
  all: { label: "Tất cả", status: undefined },
  drafts: { label: "Bản nháp", status: "DRAFT" },
  pending: { label: "Chờ duyệt", status: "PENDING_REVIEW" },
  approved: { label: "Đã duyệt", status: "APPROVED" },
};

export const toTab = (value: string): Tab => TAB_IDS.find((id) => id === value) ?? "all";

/** The list's URL state (`nuqs`): the tab and the page, so a link opens the same view. */
export const designListUrlState = {
  tab: parseAsStringLiteral(TAB_IDS).withDefault("all"),
  page: parseAsInteger.withDefault(1),
};
