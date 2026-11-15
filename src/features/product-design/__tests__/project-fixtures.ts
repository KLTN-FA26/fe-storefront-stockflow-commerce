import { ids } from "./fixtures";

/** A project answer shaped as the contract of spec 2026-11-12 §3, inside the envelope. */
export const projectDto = (overrides: Record<string, unknown> = {}) => ({
  id: ids.project,
  name: "Bộ ly quán Hoa",
  description: null,
  status: "ACTIVE",
  version: 1,
  designCount: 0,
  previewUrls: [],
  openRound: null,
  createdAt: "2026-11-10T08:00:00Z",
  updatedAt: "2026-11-11T08:00:00Z",
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
