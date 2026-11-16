import { describe, expect, it } from "vitest";

import { LIBRARY_LIMIT, libraryActions } from "../library-rules";
import { libraryItemSchema } from "../library-schemas";
import { libraryImageDto, libraryTextDto } from "./project-fixtures";

const items = (images: number, texts: number) => [
  ...Array.from({ length: images }, (_, n) =>
    libraryItemSchema.parse(
      libraryImageDto({ id: `7a1b0000-0000-4000-8000-${String(n).padStart(12, "0")}` }),
    ),
  ),
  ...Array.from({ length: texts }, () => libraryItemSchema.parse(libraryTextDto())),
];

describe("libraryActions", () => {
  it("allows everything in an ACTIVE project with room, and always allows placing", () => {
    expect(libraryActions({ status: "ACTIVE" }, items(2, 2))).toEqual({
      addImage: { allowed: true },
      saveText: { allowed: true },
      remove: { allowed: true },
      place: { allowed: true },
    });
  });

  it("locks adding images at 30 images, not at 30 items, and says why", () => {
    const actions = libraryActions({ status: "ACTIVE" }, items(LIBRARY_LIMIT, 1));
    expect(actions.addImage).toEqual({ allowed: false, reason: "Thư viện đã đủ 30 ảnh" });
    expect(actions.saveText.allowed).toBe(true);
  });

  it("locks saving text styles at 30 text styles, apart from the images", () => {
    const actions = libraryActions({ status: "ACTIVE" }, items(5, LIBRARY_LIMIT));
    expect(actions.saveText).toEqual({ allowed: false, reason: "Thư viện đã đủ 30 mẫu chữ" });
    expect(actions.addImage.allowed).toBe(true);
  });

  it("allows one place short of the limit", () => {
    expect(libraryActions({ status: "ACTIVE" }, items(LIBRARY_LIMIT - 1, 0)).addImage.allowed).toBe(
      true,
    );
  });

  it("locks adding and deleting in a closed project, but not placing (A-E2)", () => {
    const actions = libraryActions({ status: "ARCHIVED" }, items(1, 1));
    const closed = { allowed: false, reason: "Dự án đã đóng" };
    expect(actions).toEqual({
      addImage: closed,
      saveText: closed,
      remove: closed,
      place: { allowed: true },
    });
  });
});
