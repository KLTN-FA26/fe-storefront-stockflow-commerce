import { formatDateTime } from "@/lib/format";

import type { CustomizationTemplate } from "./engine/template/schema";
import { isReturned } from "./lifecycle";
import type { Design, DesignEvent, DesignEventType, DesignStatus, PrintConfig } from "./types";

/**
 * The template the studio works with: the print configuration's own, with its file limits taken
 * from `fileRules`, the source of truth the server checks uploads and submissions against (ruling
 * R20; spec §7 names `fileRules.minDpi`). Every screen that takes a template from a print
 * configuration takes it from here.
 */
export function templateOf(
  config: Pick<PrintConfig, "template" | "fileRules">,
): CustomizationTemplate {
  const { minDpi, formats, maxFileSizeMb } = config.fileRules;
  return { ...config.template, minDpi, allowedFileFormats: [...formats], maxFileSizeMb };
}

/** A product status that still takes designs, as the print configuration sends it (BR-01). */
const USABLE_PRODUCT_STATUSES: ReadonlySet<string> = new Set(["APPROVED", "PUBLISHED"]);

/**
 * Whether a variant takes designs: it is ACTIVE and its product is usable (docs 12 BR-01, catalog
 * BR-14). The server answers 422 VARIANT_UNAVAILABLE to a create, and fails the submit, otherwise.
 */
export const isPrintConfigUsable = (config: Pick<PrintConfig, "variantStatus" | "product">) =>
  config.variantStatus === "ACTIVE" && USABLE_PRODUCT_STATUSES.has(config.product.status);

const readableDateTime = (iso: string | null | undefined) =>
  iso && !Number.isNaN(Date.parse(iso)) ? formatDateTime(iso) : null;

export type DesignCardView = {
  title: string;
  /** "{product} · {variant}". */
  subtitle: string;
  /** The last save, formatted (Asia/Ho_Chi_Minh); null when it cannot be read. */
  updatedLabel: string | null;
  status: DesignStatus;
  /** The reason of the latest return, for a returned draft only. */
  returnReason: string | null;
  previewUrl: string | null;
};

/** What a design card shows (spec §6.3). */
export function designCardView(design: Design): DesignCardView {
  return {
    title: design.name,
    subtitle: `${design.product.title} · ${design.variant.label}`,
    updatedLabel: readableDateTime(design.updatedAt),
    status: design.status,
    returnReason: isReturned(design) ? (design.lastReturn?.reason ?? null) : null,
    previewUrl: design.previewUrl,
  };
}

/** docs 12 §3: a design name has at most 200 characters. */
const NAME_MAX = 200;

/**
 * "{product title} · {variant label}" (spec §6.2): what a design started from a variant is called
 * until the customer renames it. A long name is cut from the product title, so the variant stays.
 */
export function defaultDesignName(productTitle: string, variantLabel: string): string {
  const label = variantLabel.trim().slice(0, NAME_MAX);
  const suffix = label ? ` · ${label}` : "";
  const title = productTitle
    .trim()
    .slice(0, Math.max(NAME_MAX - suffix.length, 0))
    .trimEnd();
  return title ? `${title}${suffix}` : label;
}

/** What each history event (docs 12 §5.3) reads as to the customer. */
const EVENT_LABELS: Record<DesignEventType, string> = {
  CREATED: "Tạo thiết kế",
  DERIVED_FROM_SNAPSHOT: "Tạo bản sửa từ thiết kế đã duyệt",
  PREFLIGHT_FAILED: "Chưa đạt kiểm tra tự động",
  SUBMITTED_FOR_REVIEW: "Gửi duyệt",
  RETURNED: "Bị trả lại",
  APPROVED: "Đã duyệt",
  ARCHIVED: "Xoá bản nháp",
  ADDED_TO_PROJECT: "Thêm vào dự án",
  REMOVED_FROM_PROJECT: "Gỡ khỏi dự án",
};

/**
 * Events whose note is written for the customer: the return reason and the checks that failed. The
 * others carry ids and checksums (a snapshot, the approval), not something to read.
 */
const CUSTOMER_NOTES: ReadonlySet<DesignEventType> = new Set(["RETURNED", "PREFLIGHT_FAILED"]);

export type EventView = { label: string; note: string | null; atLabel: string | null };

/** One row of a design's history: its label, the note the customer may read, and its time. */
export function eventView(event: DesignEvent): EventView {
  const note = event.note?.trim();
  return {
    label: EVENT_LABELS[event.type],
    note: note && CUSTOMER_NOTES.has(event.type) ? note : null,
    atLabel: readableDateTime(event.at),
  };
}
