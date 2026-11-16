import { describe, expect, it } from "vitest";

import { artifactUploadKey, newRunNonce, uploadKey, type ArtifactKeyInput } from "../upload-key";

const bytes = new Uint8Array([1, 2, 3]);
const layoutA = "a".repeat(64);
const layoutB = "b".repeat(64);

const upload = (change: Partial<ArtifactKeyInput> = {}): ArtifactKeyInput => ({
  runNonce: "run-1",
  designId: "design-1",
  role: "PRINT_READY",
  documentChecksum: layoutA,
  bytes,
  name: "bản in.pdf",
  contentType: "application/pdf",
  ...change,
});

describe("uploadKey (images)", () => {
  it("is the same for the same bytes, name and type, and differs otherwise", async () => {
    const base = await uploadKey(bytes, "a.png", "image/png");
    expect(await uploadKey(bytes, "a.png", "image/png")).toBe(base);
    expect(await uploadKey(bytes, "b.png", "image/png")).not.toBe(base);
    expect(await uploadKey(bytes, "a.png", "image/jpeg")).not.toBe(base);
    expect(await uploadKey(new Uint8Array([1, 2, 4]), "a.png", "image/png")).not.toBe(base);
  });
});

describe("artifactUploadKey", () => {
  it("is the same for the same upload of the same run: a true retry replays", async () => {
    expect(await artifactUploadKey(upload())).toBe(await artifactUploadKey(upload()));
  });

  it("differs for another run with an identical layout and bytes: a new upload, not a replay", async () => {
    expect(await artifactUploadKey(upload({ runNonce: "run-2" }))).not.toBe(
      await artifactUploadKey(upload()),
    );
  });

  it("differs by design, role, layout, bytes, name and type", async () => {
    const base = await artifactUploadKey(upload());
    for (const change of [
      { designId: "design-2" },
      { role: "TECHNICAL_SPEC" },
      { documentChecksum: layoutB },
      { bytes: new Uint8Array([9]) },
      { name: "khác.pdf" },
      { contentType: "image/png" },
    ] satisfies Partial<ArtifactKeyInput>[]) {
      expect(await artifactUploadKey(upload(change))).not.toBe(base);
    }
  });

  it("is a valid Idempotency-Key (8 to 255 characters)", async () => {
    expect(await artifactUploadKey(upload())).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("newRunNonce", () => {
  it("makes a new nonce each time", () => {
    expect(newRunNonce()).not.toBe(newRunNonce());
  });
});
