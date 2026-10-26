import { afterEach, describe, expect, it } from "vitest";

import { SIGNED_IN_STORAGE_PREFIX } from "@/lib/auth/signed-in-storage";

import {
  DRAFT_TTL_MS,
  readUnsavedDraft,
  unsavedDraftKey,
  writeUnsavedDraft,
} from "../components/studio/unsaved-draft";
import { emptyDocument } from "../engine";
import { cup12oz } from "../engine/__tests__/fixtures";

const ID = "7d51f000-0000-4000-8000-000000000002";
const draft = { baseVersion: 3, baseChecksum: "0".repeat(64), document: emptyDocument(cup12oz) };

afterEach(() => {
  window.localStorage.clear();
});

describe("the unsaved draft kept in this browser (N3)", () => {
  it("lives under the signed-in prefix, so signing out removes it", () => {
    expect(unsavedDraftKey(ID).startsWith(SIGNED_IN_STORAGE_PREFIX)).toBe(true);
  });

  it("is offered back within a week of being kept", () => {
    writeUnsavedDraft(ID, draft);
    const kept = readUnsavedDraft(ID);

    expect(kept).toMatchObject(draft);
    expect(readUnsavedDraft(ID, kept!.savedAt + DRAFT_TTL_MS)).not.toBeNull();
  });

  it("is dropped, not offered, once it is older than a week", () => {
    writeUnsavedDraft(ID, draft);
    const { savedAt } = readUnsavedDraft(ID)!;

    expect(readUnsavedDraft(ID, savedAt + DRAFT_TTL_MS + 1)).toBeNull();
    expect(window.localStorage.getItem(unsavedDraftKey(ID))).toBeNull();
  });

  it("forgets a draft kept without a date (written before drafts expired)", () => {
    window.localStorage.setItem(unsavedDraftKey(ID), JSON.stringify(draft));

    expect(readUnsavedDraft(ID)).toBeNull();
    expect(window.localStorage.getItem(unsavedDraftKey(ID))).toBeNull();
  });
});
