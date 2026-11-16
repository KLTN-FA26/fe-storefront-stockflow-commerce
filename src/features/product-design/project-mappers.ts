import { toDesign } from "./design-mappers";
import { hexSchema } from "./engine/document/schema";
import { LIBRARY_NAME_MAX } from "./library-schemas";
import type {
  ProjectAssetDto,
  ProjectDto,
  ProjectEventDto,
  ProjectSummaryDto,
  ProjectTextDto,
} from "./project-dtos";
import { PROJECT_PREVIEW_MAX, projectEventTypeSchema } from "./project-schemas";
import type {
  DesignProject,
  LibraryImage,
  LibraryText,
  ProjectEvent,
  ProjectSummary,
} from "./types";

// DTO → domain, for the projects and their library (see `project-dtos.ts`). What the BE has no
// source for is derived here from what it has (F-26 … F-36).

export function toProjectSummary(dto: ProjectSummaryDto): ProjectSummary {
  return {
    id: dto.id,
    name: dto.name,
    description: dto.description ?? null,
    status: dto.status,
    version: dto.version,
    designCount: dto.designCount,
    createdAt: dto.createdAt,
    archivedAt: dto.archivedAt ?? null,
  };
}

/**
 * A project from its detail. Its designs are the BE's (archived ones are left out), newest updated
 * first (F-30), each carrying this project as its own `project` (F-8). Derived:
 *  - `previewUrls` (F-26): the previews of the first four designs that have one;
 *  - `openRound` (F-27): the designs `PENDING_REVIEW` since the earliest request for review. The
 *    BE does not let a customer read a round, so a single design sent alone looks the same.
 */
export function toProject(dto: ProjectDto): DesignProject {
  const ref = { id: dto.id, name: dto.name, status: dto.status };
  const designs = dto.designs
    .map((design) => toDesign(design, ref))
    .toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const pending = designs.filter((design) => design.status === "PENDING_REVIEW");
  const since = pending
    .map((design) => design.submittedAt ?? design.updatedAt)
    .toSorted()
    .at(0);
  return {
    ...toProjectSummary({ ...dto, designCount: designs.length }),
    previewUrls: designs
      .flatMap((design) => (design.previewUrl ? [design.previewUrl] : []))
      .slice(0, PROJECT_PREVIEW_MAX),
    openRound:
      pending.length > 0 && since !== undefined
        ? { designIds: pending.map((design) => design.id), openedAt: since }
        : null,
    designs,
  };
}

/** A history row (F-16): `event` → `type`, `createdAt` → `at`, `notes` → `note`; an unknown event is `OTHER`. */
export function toProjectEvent(dto: ProjectEventDto): ProjectEvent {
  const known = projectEventTypeSchema.safeParse(dto.event);
  return {
    type: known.success ? known.data : "OTHER",
    at: dto.createdAt,
    note: dto.notes ?? null,
  };
}

/** A library file as the screens' image item (F-33): `id` ← `assetId`, `createdAt` ← `storedAt`, `name` ← `originalName`. */
export function toLibraryImage(dto: ProjectAssetDto, previewUrl: string | null): LibraryImage {
  const { assetId, originalName, contentType, sizeBytes, checksum, widthPx, heightPx, storedAt } =
    dto;
  return {
    id: assetId,
    kind: "IMAGE",
    name: originalName || "Ảnh",
    asset: { originalName, contentType, widthPx, heightPx, sizeBytes, checksum, storedAt },
    previewUrl,
    createdAt: storedAt,
  };
}

/** `#rgb`, `#rrggbb` or `#rrggbbaa` as the studio's `#RRGGBB`: short forms expanded, an alpha dropped. */
export function normalizeHex(color: string) {
  const hex = color.replace(/^#/, "");
  const full = hex.length === 3 ? [...hex].map((c) => c + c).join("") : hex.slice(0, 6);
  return hexSchema.parse(`#${full}`);
}

/** A text as a list entry: its words on one line, cut at `LIBRARY_NAME_MAX`. */
export function nameOfText(text: string): string {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length <= LIBRARY_NAME_MAX ? line : `${line.slice(0, LIBRARY_NAME_MAX - 1)}…`;
}

/** A saved text (F-33): the BE has no `kind` or `name`; the colours are normalised to `#RRGGBB`. */
export function toLibraryText(dto: ProjectTextDto): LibraryText {
  const { style } = dto;
  return {
    id: dto.id,
    kind: "TEXT",
    name: nameOfText(dto.text),
    text: dto.text,
    style: {
      fontCode: style.fontCode,
      sizePt: style.sizePt,
      color: normalizeHex(style.color),
      bold: style.bold ?? false,
      italic: style.italic ?? false,
      align: style.align,
      letterSpacingEm: style.letterSpacingEm ?? 0,
      lineHeight: style.lineHeight,
      ...(style.outline
        ? { outline: { color: normalizeHex(style.outline.color), widthMm: style.outline.widthMm } }
        : {}),
    },
    createdAt: dto.createdAt,
  };
}
