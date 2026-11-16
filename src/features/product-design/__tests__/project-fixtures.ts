import { projectDtoSchema } from "../project-dtos";
import { toProject } from "../project-mappers";
import { ids } from "./fixtures";

/**
 * A project as the BE answers it (`DesignProjectResponse`): its designs aside, no `description`
 * (a null is left out), no previews or round (those are derived from `designs`).
 */
export const projectDto = (overrides: Record<string, unknown> = {}) => ({
  id: ids.project,
  name: "Bộ ly quán Hoa",
  status: "ACTIVE",
  version: 1,
  createdAt: "2026-11-10T08:00:00Z",
  designs: [],
  assetCount: 0,
  ...overrides,
});

/** A project as the screens hold it (the domain `DesignProject`), from what the BE sends. */
export const project = (overrides: Record<string, unknown> = {}) =>
  toProject(projectDtoSchema.parse(projectDto(overrides)));

/** A row of the BE's project list (`DesignProjectSummaryResponse`). */
export const projectSummaryDto = (overrides: Record<string, unknown> = {}) => ({
  id: ids.project,
  name: "Bộ ly quán Hoa",
  status: "ACTIVE",
  version: 1,
  designCount: 0,
  createdAt: "2026-11-10T08:00:00Z",
  ...overrides,
});

/** A row of a project's history as the BE sends it (`DesignProjectEventResponse`), newest first in a page. */
export const projectEventDto = (overrides: Record<string, unknown> = {}) => ({
  event: "PROJECT_CREATED",
  createdAt: "2026-11-10T08:00:00Z",
  ...overrides,
});

/** A library file as the BE sends it (`DesignProjectAssetResponse`). */
export const projectAssetDto = (overrides: Record<string, unknown> = {}) => ({
  assetId: "7a1b0000-0000-4000-8000-0000000000a1",
  projectId: ids.project,
  originalName: "logo.png",
  contentType: "image/png",
  sizeBytes: 90_001,
  checksum: "c".repeat(64),
  widthPx: 1200,
  heightPx: 800,
  storedAt: "2026-11-11T07:50:00Z",
  ...overrides,
});

/** A library text as the BE sends it (`DesignProjectTextResponse`): no `kind`, no `name`. */
export const projectTextDto = (overrides: Record<string, unknown> = {}) => ({
  id: "7a1b0000-0000-4000-8000-0000000000a2",
  projectId: ids.project,
  text: "Xin chào",
  style: textStyleDto(),
  createdAt: "2026-11-11T07:55:00Z",
  ...overrides,
});

/** A text style as a text element holds it (spec 2026-11-12 §3, `LibraryItem`). */
export const textStyleDto = (overrides: Record<string, unknown> = {}) => ({
  fontCode: "be-vietnam-pro",
  sizePt: 24,
  color: "#112233",
  bold: true,
  italic: false,
  align: "center",
  letterSpacingEm: 0.05,
  lineHeight: 1.2,
  ...overrides,
});

/** A library image answer, as the server sends it. */
export const libraryImageDto = (overrides: Record<string, unknown> = {}) => ({
  id: "7a1b0000-0000-4000-8000-0000000000a1",
  kind: "IMAGE",
  name: "logo.png",
  asset: {
    originalName: "logo.png",
    contentType: "image/png",
    widthPx: 1200,
    heightPx: 800,
    sizeBytes: 90_001,
    checksum: "c".repeat(64),
    storedAt: "2026-11-11T07:50:00Z",
  },
  previewUrl: "https://files.example.vn/library/logo.png?sig=abc",
  createdAt: "2026-11-11T07:50:00Z",
  ...overrides,
});

/** A library text-style answer. */
export const libraryTextDto = (overrides: Record<string, unknown> = {}) => ({
  id: "7a1b0000-0000-4000-8000-0000000000a2",
  kind: "TEXT",
  name: "Xin chào",
  text: "Xin chào",
  style: textStyleDto(),
  createdAt: "2026-11-11T07:55:00Z",
  ...overrides,
});
