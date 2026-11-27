import { formatDateTime } from "@/lib/format";
import { variantLabel } from "@/lib/catalog/variant-label";

import type { DesignDocument } from "./engine/document/schema";
import type { CustomizationTemplate } from "./engine/template/schema";
import { isReturned } from "./lifecycle";
import { describeRecordedFailure } from "./preflight-messages";
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
  const variant = variantLabel(
    { sku: design.variant.sku, name: design.variant.label },
    design.product.title,
  );
  // A design still named after its product ("Ly giấy 12oz · …") says the product in its title: the line under it only
  // adds the variant, instead of repeating the product a second time.
  const named = design.name.toLowerCase().includes(design.product.title.toLowerCase());
  return {
    title: design.name,
    subtitle: named ? `Quy cách: ${variant}` : `${design.product.title} · ${variant}`,
    updatedLabel: readableDateTime(design.updatedAt),
    status: design.status,
    returnReason: isReturned(design) ? (design.lastReturn?.reason ?? null) : null,
    previewUrl: design.previewUrl,
  };
}

/**
 * A document nobody has drawn on: no element on any face and no background chosen. The launcher offers to go on with
 * such a draft instead of making another one for the same variant (S08-11).
 */
export function isUntouchedDocument(document: DesignDocument): boolean {
  return Object.values(document.surfaces).every(
    (face) => face === undefined || (face.elements.length === 0 && face.background.kind === "none"),
  );
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
  QUOTE_REQUESTED: "Yêu cầu báo giá",
  OTHER: "Cập nhật khác",
};

/**
 * Events whose note is written for the customer: the return reason and the checks that failed. The
 * others carry ids and checksums (a snapshot, the approval), not something to read.
 */
const CUSTOMER_NOTES: ReadonlySet<DesignEventType> = new Set(["RETURNED", "PREFLIGHT_FAILED"]);

export type EventView = { label: string; note: string | null; atLabel: string | null };

/**
 * One row of a design's history: its label, the note the customer may read, and its time. A return
 * reason is the reviewer's own text; the note of a failed check is the BE's rule codes and element
 * ids, so it is worded (`describeRecordedFailure`) and never shown as it is.
 */
export function eventView(event: DesignEvent): EventView {
  const note = event.note?.trim();
  const readable =
    note && event.type === "PREFLIGHT_FAILED" ? describeRecordedFailure(note) : (note ?? null);
  return {
    label: EVENT_LABELS[event.type],
    note: readable && CUSTOMER_NOTES.has(event.type) ? readable : null,
    atLabel: readableDateTime(event.at),
  };
}
