/**
 * The DTOs the design mock answers with, built from the rows of `design-rows.ts` (which
 * re-exports this file, so every importer keeps its path). Nullable fields are sent as `null`.
 */

import type { DesignDocument } from "@/features/product-design/engine/document/schema";

import type {
  AssetRow,
  DesignRow,
  EventRow,
  FileRow,
  LibraryImageRow,
  LibraryRow,
  ProjectEventRow,
  ProjectRow,
  ProjectStatus,
  ReviewRoundRow,
  TextStyle,
} from "./design-rows";

/** The project a design belongs to, as the studio header and the card label read it. */
export type DesignProjectDto = { id: string; name: string; status: ProjectStatus };
export type DesignDto = Omit<DesignRow, "seq" | "clone"> & {
  previewUrl: string | null;
  project: DesignProjectDto | null;
};
/**
 * The oldest round of a project still open, as the project page's strip reads it: `designIds` are
 * the designs still waiting for a decision in it, not every design it held.
 */
export type OpenRoundDto = Pick<ReviewRoundRow, "id" | "designIds" | "openedAt">;
export type ProjectDto = Omit<ProjectRow, "seq"> & {
  designCount: number;
  /** The first up to 4 preview URLs of the project's designs. */
  previewUrls: string[];
  /** The oldest review round still open; null when none is. */
  openRound: OpenRoundDto | null;
};
export type ProjectEventDto = Omit<ProjectEventRow, "projectId">;
export type LibraryItemDto =
  | {
      id: string;
      kind: "IMAGE";
      name: string;
      /** The image as a `DesignAsset` describes it, less the design it belongs to. */
      asset: Pick<
        LibraryImageRow,
        | "originalName"
        | "contentType"
        | "widthPx"
        | "heightPx"
        | "sizeBytes"
        | "checksum"
        | "storedAt"
      >;
      previewUrl: string | null;
      createdAt: string;
    }
  | {
      id: string;
      kind: "TEXT";
      name: string;
      text: string;
      style: TextStyle;
      createdAt: string;
    };
export type DesignEventDto = Omit<EventRow, "designId">;
export type DesignAssetDto = Omit<AssetRow, "uploadKey" | "url">;
export type DesignFileDto = Pick<FileRow, "role" | "name" | "sizeBytes" | "sha256"> & {
  url: string;
};
export type DesignDocumentRecordDto = {
  designId: string;
  version: number;
  document: DesignDocument;
  checksum: string;
  updatedAt: string;
};

export const toDesignDto = (
  { seq: _seq, clone: _clone, ...row }: DesignRow,
  previewUrl: string | null,
  project: ProjectRow | undefined,
): DesignDto =>
  structuredClone({
    ...row,
    previewUrl,
    project: project ? { id: project.id, name: project.name, status: project.status } : null,
  });

export const toProjectDto = (
  { seq: _seq, ...row }: ProjectRow,
  designCount: number,
  previewUrls: string[],
  round: ReviewRoundRow | undefined,
): ProjectDto =>
  structuredClone({
    ...row,
    designCount,
    previewUrls,
    openRound: round
      ? { id: round.id, designIds: round.designIds, openedAt: round.openedAt }
      : null,
  });

export const toProjectEventDto = ({
  projectId: _projectId,
  ...event
}: ProjectEventRow): ProjectEventDto => ({ ...event });

export function toLibraryItemDto(row: LibraryRow, previewUrl: string | null): LibraryItemDto {
  if (row.kind === "TEXT") {
    const { id, kind, name, text, style, createdAt } = row;
    return structuredClone({ id, kind, name, text, style, createdAt });
  }
  const { id, kind, name, createdAt, originalName, contentType, widthPx, heightPx } = row;
  const { sizeBytes, checksum, storedAt } = row;
  return {
    id,
    kind,
    name,
    asset: { originalName, contentType, widthPx, heightPx, sizeBytes, checksum, storedAt },
    previewUrl,
    createdAt,
  };
}

export const toEventDto = ({ designId: _designId, ...event }: EventRow): DesignEventDto => ({
  ...event,
});

export const toAssetDto = ({ uploadKey: _key, url: _url, ...asset }: AssetRow): DesignAssetDto => ({
  ...asset,
});
