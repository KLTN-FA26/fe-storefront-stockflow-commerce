import { describe, expect, it } from "vitest";

import type { DesignDocument } from "@/features/product-design/engine/document/schema";
import { sha256Hex } from "@/features/product-design/engine/export/checksum";

import type {
  DesignDocumentRecordDto,
  DesignDto,
  DesignEventDto,
  DesignFileDto,
  MockResult,
} from "./design-rows";
import { MOCK_DESIGN_IDS, seedDesignState } from "./design-seed";
import { createMemoryStorage, type DesignMockStorage } from "./design-storage";
import { createDesignMockStore } from "./design-store";

const settle = (result: MockResult) => {
  expect(result.status).toBeLessThan(300);
  return result;
};
const uuid = (n: number) => `5e5e0000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
const T0 = Date.UTC(2026, 10, 12, 8, 0, 0);
const CUP12 = { productSlug: "ly-giay-2-lop-12oz", sku: "CUP-PAPER-12OZ-WHT" };
const DAY_MS = 24 * 60 * 60 * 1000;

/** Memory storage that also says which blobs it holds right now. */
function trackedStorage() {
  const inner = createMemoryStorage();
  const keys = new Set<string>();
  const storage: DesignMockStorage = {
    ...inner,
    async putBlob(key, blob) {
      keys.add(key);
      await inner.putBlob(key, blob);
    },
    async deleteBlob(key) {
      keys.delete(key);
      await inner.deleteBlob(key);
    },
    async clear() {
      keys.clear();
      await inner.clear();
    },
  };
  return { storage, blobKeys: () => [...keys].toSorted() };
}

/** A store over memory, its clock moving a second per read; `later(ms)` moves it further. */
async function makeStore(storage: DesignMockStorage = createMemoryStorage()) {
  let ids = 0;
  let clock = T0;
  const store = await createDesignMockStore({
    storage,
    now: () => new Date((clock += 1000)),
    newId: () => uuid(0x3000 + ids++),
    readImageSize: async () => ({ widthPx: 1200, heightPx: 800 }),
    toUrl: (key) => `blob:test/${key}`,
  });
  return Object.assign(store, {
    storage,
    later: (ms: number) => {
      clock += ms;
    },
  });
}
type Store = Awaited<ReturnType<typeof makeStore>>;

type Round = {
  id: string;
  projectId: string;
  designIds: string[];
  openedAt: string;
  closedAt: string | null;
};
type Project = {
  id: string;
  status: string;
  updatedAt: string;
  openRound: { id: string; designIds: string[]; openedAt: string } | null;
};

type ProjectEvent = { type: string; at: string; version: number; note: string | null };

const data = <T>(result: MockResult) => (result.data as { data: T }).data;
const errorOf = (result: MockResult) =>
  result.data as {
    errorCode: string;
    details?: { designIds?: string[]; failures?: Array<{ designId: string; issues: unknown[] }> };
  };
const refusal = (result: MockResult) => [result.status, errorOf(result).errorCode];

const PASS = { result: "Pass", issues: [] };

/** The three files of one design's submission and their SHA-256, as the browser sends them. */
async function bundle(seed: string) {
  const files = {
    CUSTOMER_PREVIEW: new File([`preview ${seed}`], "preview.png", { type: "image/png" }),
    PRINT_READY: new File([`print ${seed}`], "print-ready.pdf", { type: "application/pdf" }),
    TECHNICAL_SPEC: new File([`spec ${seed}`], "technical-spec.pdf", { type: "application/pdf" }),
  };
  const hash = async (file: Blob) => sha256Hex(new Uint8Array(await file.arrayBuffer()));
  const checksums = {
    CUSTOMER_PREVIEW: await hash(files.CUSTOMER_PREVIEW),
    PRINT_READY: await hash(files.PRINT_READY),
    TECHNICAL_SPEC: await hash(files.TECHNICAL_SPEC),
  };
  return { files, checksums };
}

/** A text on the first surface: the content the server's own check wants. */
function withText(document: DesignDocument): DesignDocument {
  const [code] = Object.keys(document.surfaces) as Array<keyof DesignDocument["surfaces"]>;
  return {
    ...document,
    surfaces: {
      ...document.surfaces,
      [code!]: {
        background: { kind: "none" },
        elements: [
          {
            id: "t1",
            type: "text",
            name: "Chữ",
            hidden: false,
            locked: false,
            opacity: 1,
            placement: { u: 60, v: 50, rotationDeg: 0, scale: 1 },
            content: "Nhà Mình",
            fontCode: "be-vietnam-pro",
            sizePt: 24,
            color: "#112233",
            align: "center",
            bold: false,
            italic: false,
            letterSpacingEm: 0,
            lineHeight: 1.2,
          },
        ],
      },
    },
  };
}

async function newProject(store: Store, name = "Quán Hoa") {
  const result = await store.createProject({ name });
  expect(result.status).toBe(201);
  return data<Project>(result);
}

/** A cup draft of `projectId` with some text (version 1), or empty (version 0). */
async function draftIn(store: Store, projectId: string, name: string, filled = true) {
  const created = await store.create({ ...CUP12, name, projectId });
  expect(created.status).toBe(201);
  const { id } = data<DesignDto>(created);
  if (filled) {
    const record = data<DesignDocumentRecordDto>(await store.getDocument(id));
    const saved = await store.putDocument(id, {
      version: record.version,
      document: withText(record.document),
    });
    expect(saved.status).toBe(200);
  }
  return id;
}

const designOf = async (store: Store, id: string) => data<DesignDto>(await store.get(id));
const projectEvents = async (store: Store, projectId: string) =>
  data<ProjectEvent[]>(await store.projectHistory(projectId));
const batchEvents = async (store: Store, projectId: string) =>
  (await projectEvents(store, projectId)).filter((event) => event.type.startsWith("BATCH_"));

/** Uploads a design's files for a set; answers its round item (`version` as read before). */
async function uploaded(store: Store, id: string, seed = id, key = `key-${seed}`) {
  const { version } = await designOf(store, id);
  const { files, checksums } = await bundle(seed);
  const result = await store.uploadSubmission(id, { files, checksums }, key);
  expect(result.status).toBe(201);
  const { uploadToken } = data<{ uploadToken: string }>(result);
  return { designId: id, version, uploadToken, preflight: PASS, checksums };
}

/** Two filled drafts of a new project, each uploaded: what opening a round needs. */
async function readySet(store: Store) {
  const project = await newProject(store);
  const a = await draftIn(store, project.id, "Ly 12oz");
  const b = await draftIn(store, project.id, "Túi");
  return { project, a, b, items: [await uploaded(store, a), await uploaded(store, b)] };
}

/** What a refused round must have left: each design a DRAFT as it was, the project with no round. */
async function expectUnchanged(store: Store, projectId: string, before: DesignDto[]) {
  for (const design of before) {
    const now = await designOf(store, design.id);
    expect(now).toMatchObject({ status: "DRAFT", version: design.version, submittedAt: null });
    const history = data<DesignEventDto[]>(await store.history(design.id));
    expect(history.map((event) => event.type)).not.toContain("SUBMITTED_FOR_REVIEW");
  }
  expect(data<Project>(await store.getProject(projectId)).openRound).toBeNull();
  const types = (await projectEvents(store, projectId)).map((event) => event.type);
  expect(types).not.toContain("BATCH_SUBMITTED");
}

describe("uploads of a set submission (POST /designs/{id}/submission-uploads)", () => {
  it("keeps the three files and answers a token; the same key again answers it again and stores nothing more", async () => {
    const { storage, blobKeys } = trackedStorage();
    const store = await makeStore(storage);
    const { a } = await readySet(store);
    const { files, checksums } = await bundle("again");

    const first = await store.uploadSubmission(a, { files, checksums }, "same-key");
    const blobsAfterFirst = blobKeys();
    const replay = await store.uploadSubmission(a, { files, checksums }, "same-key");

    expect(first.status).toBe(201);
    expect(replay.status).toBe(201);
    expect(data(replay)).toEqual(data(first));
    expect(blobKeys()).toEqual(blobsAfterFirst);
    expect(stored(await store.storage.load())?.submissionUploads).toHaveLength(3);
    // The design itself is untouched: still a DRAFT at its version, no files listed yet.
    expect(await designOf(store, a)).toMatchObject({ status: "DRAFT", version: 1 });
    expect(data<DesignFileDto[]>(await store.files(a))).toEqual([]);
  });

  it("refuses the same key with other files (422 IDEMPOTENCY_KEY_REUSED)", async () => {
    const store = await makeStore();
    const { a } = await readySet(store);
    await store.uploadSubmission(a, await bundle("one"), "k");
    expect(refusal(await store.uploadSubmission(a, await bundle("two"), "k"))).toEqual([
      422,
      "IDEMPOTENCY_KEY_REUSED",
    ]);
  });

  it("refuses an unknown design, a missing key, a missing file, a checksum mismatch and a design no longer a draft", async () => {
    const store = await makeStore();
    const { a, b } = await readySet(store);
    const sent = await bundle("x");

    expect(refusal(await store.uploadSubmission(uuid(99), sent, "k"))).toEqual([404, "NOT_FOUND"]);
    expect(refusal(await store.uploadSubmission(a, sent, undefined))).toEqual([
      422,
      "VALIDATION_FAILED",
    ]);
    const { TECHNICAL_SPEC: _spec, ...twoFiles } = sent.files;
    expect(refusal(await store.uploadSubmission(a, { ...sent, files: twoFiles }, "k"))).toEqual([
      422,
      "FILE_REJECTED",
    ]);
    const wrong = { ...sent.checksums, PRINT_READY: "0".repeat(64) };
    expect(refusal(await store.uploadSubmission(a, { ...sent, checksums: wrong }, "k"))).toEqual([
      422,
      "FILE_REJECTED",
    ]);
    const single = await store.submit(b, {
      version: (await designOf(store, b)).version,
      preflight: PASS,
      ...(await bundle("single")),
    });
    expect(single.status).toBe(200);
    expect(refusal(await store.uploadSubmission(b, sent, "k"))).toEqual([409, "INVALID_STATE"]);
  });
});

describe("a review round (POST /design-projects/{id}/review-rounds), all or nothing (BR-19)", () => {
  it("sends every design to PENDING_REVIEW at once, records the round on each and on the project", async () => {
    const store = await makeStore();
    const { project, a, b, items } = await readySet(store);

    const result = await store.openReviewRound(project.id, { items });

    expect(result.status).toBe(201);
    const round = data<Round>(result);
    expect(round).toMatchObject({ projectId: project.id, designIds: [a, b], closedAt: null });
    for (const id of [a, b]) {
      const design = await designOf(store, id);
      expect(design).toMatchObject({
        status: "PENDING_REVIEW",
        version: 2,
        submittedAt: round.openedAt,
        updatedAt: round.openedAt,
      });
      const history = data<DesignEventDto[]>(await store.history(id));
      expect(history.at(-1)).toEqual({
        type: "SUBMITTED_FOR_REVIEW",
        at: round.openedAt,
        version: 2,
        note: round.id,
      });
    }
    const after = data<Project>(await store.getProject(project.id));
    expect(after.openRound).toEqual({ id: round.id, designIds: [a, b], openedAt: round.openedAt });
    expect(after.updatedAt).toBe(round.openedAt);
    // docs 12 §5.4: the project's history records the round and its designs.
    expect(await batchEvents(store, project.id)).toEqual([
      { type: "BATCH_SUBMITTED", at: round.openedAt, version: 0, note: `${round.id}: ${a}, ${b}` },
    ]);
  });

  it("leaves each design of the round to be decided like any submitted design", async () => {
    const store = await makeStore();
    const { project, a, b, items } = await readySet(store);
    await store.openReviewRound(project.id, { items });

    const approved = await store.simulateApprove(a);
    expect(approved.status).toBe(200);
    expect(data<DesignDto>(approved)).toMatchObject({ status: "APPROVED" });
    expect(data<DesignDto>(approved).approval?.bundleChecksum).toEqual(expect.any(String));
    const returned = await store.simulateReturn(b, { reason: "Logo bị mờ" });
    expect(returned.status).toBe(200);
    expect(data<DesignDto>(returned)).toMatchObject({ status: "DRAFT" });
  });

  it("lists the uploaded files as each design's latest submission, as a single submit does", async () => {
    const store = await makeStore();
    const { project, a, items } = await readySet(store);

    await store.openReviewRound(project.id, { items });

    const files = data<DesignFileDto[]>(await store.files(a));
    expect(files.map((file) => [file.role, file.sha256])).toEqual([
      ["CUSTOMER_PREVIEW", items[0]!.checksums.CUSTOMER_PREVIEW],
      ["PRINT_READY", items[0]!.checksums.PRINT_READY],
      ["TECHNICAL_SPEC", items[0]!.checksums.TECHNICAL_SPEC],
    ]);
    expect(files.every((file) => file.url.startsWith("blob:test/"))).toBe(true);
    // The card shows the round's preview.
    expect((await designOf(store, a)).previewUrl).toBe(files[0]!.url);
  });

  it("answers the same round again when the same items are sent again (an answer lost on the way)", async () => {
    const store = await makeStore();
    const { project, a, items } = await readySet(store);
    const first = data<Round>(await store.openReviewRound(project.id, { items }));

    const again = await store.openReviewRound(project.id, { items });

    expect(again.status).toBe(200);
    expect(data<Round>(again)).toEqual(first);
    expect((await designOf(store, a)).version).toBe(2);
    const history = data<DesignEventDto[]>(await store.history(a));
    expect(history.filter((event) => event.type === "SUBMITTED_FOR_REVIEW")).toHaveLength(1);
    expect(await batchEvents(store, project.id)).toHaveLength(1);
  });

  it("refuses fewer than 2 designs (422 SET_TOO_SMALL) and changes nothing", async () => {
    const store = await makeStore();
    const { project, a, items } = await readySet(store);
    const before = [await designOf(store, a)];

    expect(refusal(await store.openReviewRound(project.id, { items: [items[0]] }))).toEqual([
      422,
      "SET_TOO_SMALL",
    ]);
    expect(refusal(await store.openReviewRound(project.id, { items: [] }))).toEqual([
      422,
      "SET_TOO_SMALL",
    ]);
    await expectUnchanged(store, project.id, before);
  });

  it("refuses the whole set when one design changed since its upload (409 VERSION_CHANGED, naming it)", async () => {
    const store = await makeStore();
    const { project, a, b, items } = await readySet(store);
    // Another tab saves design b after its files were made.
    const record = data<DesignDocumentRecordDto>(await store.getDocument(b));
    await store.putDocument(b, { version: record.version, document: record.document });
    const before = [await designOf(store, a), await designOf(store, b)];

    const result = await store.openReviewRound(project.id, { items });

    expect(refusal(result)).toEqual([409, "VERSION_CHANGED"]);
    expect(errorOf(result).details?.designIds).toEqual([b]);
    // Sending b's new version does not help: its files were made from the one before.
    const current = [items[0], { ...items[1]!, version: before[1]!.version }];
    const again = await store.openReviewRound(project.id, { items: current });
    expect(refusal(again)).toEqual([409, "VERSION_CHANGED"]);
    expect(errorOf(again).details?.designIds).toEqual([b]);
    await expectUnchanged(store, project.id, before);
    // Nothing of the round was listed as files either.
    expect(data<DesignFileDto[]>(await store.files(a))).toEqual([]);
  });

  it("refuses a set whose version is not the one sent (409 VERSION_CHANGED)", async () => {
    const store = await makeStore();
    const { project, a, items } = await readySet(store);
    const stale = [{ ...items[0]!, version: items[0]!.version - 1 }, items[1]];

    const result = await store.openReviewRound(project.id, { items: stale });

    expect(refusal(result)).toEqual([409, "VERSION_CHANGED"]);
    expect(errorOf(result).details?.designIds).toEqual([a]);
  });

  it("refuses a closed project (409 PROJECT_ARCHIVED)", async () => {
    const store = await makeStore();
    const { project, a, b, items } = await readySet(store);
    const archived = await store.archiveProject(project.id, { version: 0 });
    expect(archived.status).toBe(200);
    const before = [await designOf(store, a), await designOf(store, b)];

    expect(refusal(await store.openReviewRound(project.id, { items }))).toEqual([
      409,
      "PROJECT_ARCHIVED",
    ]);
    await expectUnchanged(store, project.id, before);
  });

  it("refuses a design that is no longer a draft, or not in the project (422, naming it)", async () => {
    const store = await makeStore();
    const { project, a, b, items } = await readySet(store);
    const outside = await draftIn(store, (await newProject(store, "Khác")).id, "Ly khác");
    const outsideItem = await uploaded(store, outside);

    const notMine = await store.openReviewRound(project.id, { items: [items[0], outsideItem] });
    expect(refusal(notMine)).toEqual([422, "DESIGN_NOT_IN_PROJECT"]);
    expect(errorOf(notMine).details?.designIds).toEqual([outside]);

    const single = await store.submit(b, { version: 1, preflight: PASS, ...(await bundle("s")) });
    expect(single.status).toBe(200);
    const pending = await store.openReviewRound(project.id, { items });
    expect(refusal(pending)).toEqual([422, "DESIGN_NOT_DRAFT"]);
    expect(errorOf(pending).details?.designIds).toEqual([b]);
    await expectUnchanged(store, project.id, [await designOf(store, a)]);
  });

  it("refuses an unknown token, another design's token and checksums other than the upload's (422 UPLOAD_INVALID)", async () => {
    const store = await makeStore();
    const { project, a, b, items } = await readySet(store);
    const [first, second] = items as [(typeof items)[0], (typeof items)[0]];
    const before = [await designOf(store, a), await designOf(store, b)];

    const unknown = await store.openReviewRound(project.id, {
      items: [first, { ...second, uploadToken: "nope" }],
    });
    expect(refusal(unknown)).toEqual([422, "UPLOAD_INVALID"]);
    expect(errorOf(unknown).details?.designIds).toEqual([b]);
    const swapped = await store.openReviewRound(project.id, {
      items: [first, { ...second, uploadToken: first.uploadToken }],
    });
    expect(refusal(swapped)).toEqual([422, "UPLOAD_INVALID"]);
    const otherSums = await store.openReviewRound(project.id, {
      items: [first, { ...second, checksums: first.checksums }],
    });
    expect(refusal(otherSums)).toEqual([422, "UPLOAD_INVALID"]);
    await expectUnchanged(store, project.id, before);
  });

  it("refuses another design's token as UPLOAD_INVALID even once that design changed", async () => {
    const store = await makeStore();
    const { project, b, items } = await readySet(store);
    const [first, second] = items as [(typeof items)[0], (typeof items)[0]];
    const record = data<DesignDocumentRecordDto>(await store.getDocument(b));
    await store.putDocument(b, { version: record.version, document: record.document });

    const result = await store.openReviewRound(project.id, {
      items: [first, { ...second, version: record.version + 1, uploadToken: first.uploadToken }],
    });

    expect(refusal(result)).toEqual([422, "UPLOAD_INVALID"]);
    expect(errorOf(result).details?.designIds).toEqual([b]);
  });

  it("refuses a set with a failing design, from the browser's preflight or its own check (422 PREFLIGHT_FAILED per design)", async () => {
    const store = await makeStore();
    const project = await newProject(store);
    const a = await draftIn(store, project.id, "Ly");
    const empty = await draftIn(store, project.id, "Trống", false);
    const items = [await uploaded(store, a), await uploaded(store, empty)];
    const fail = {
      result: "Fail",
      issues: [{ ruleId: "LOW_DPI", level: "fail", message: "Ảnh mờ" }],
    };
    const before = [await designOf(store, a), await designOf(store, empty)];

    const browser = await store.openReviewRound(project.id, {
      items: [{ ...items[0]!, preflight: fail }, items[1]],
    });
    expect(refusal(browser)).toEqual([422, "PREFLIGHT_FAILED"]);
    expect(errorOf(browser).details?.designIds).toEqual([a]);
    expect(errorOf(browser).details?.failures).toEqual([{ designId: a, issues: fail.issues }]);

    const server = await store.openReviewRound(project.id, { items });
    expect(refusal(server)).toEqual([422, "PREFLIGHT_FAILED"]);
    expect(errorOf(server).details?.designIds).toEqual([empty]);
    expect(errorOf(server).details?.failures?.[0]?.issues).toEqual([
      expect.objectContaining({ ruleId: "EMPTY_DESIGN", level: "fail" }),
    ]);
    await expectUnchanged(store, project.id, before);
    // docs 12 §5.4: each refusal is in the project's history, with the issues of each design.
    const events = await batchEvents(store, project.id);
    expect(events.map((event) => [event.type, event.note])).toEqual([
      ["BATCH_PREFLIGHT_FAILED", `${a}: Ảnh mờ`],
      ["BATCH_PREFLIGHT_FAILED", `${empty}: Thiết kế chưa có nội dung.`],
    ]);
  });

  it("refuses items that are not well formed (422 VALIDATION_FAILED) and an unknown project (404)", async () => {
    const store = await makeStore();
    const { project, items } = await readySet(store);

    expect(refusal(await store.openReviewRound(uuid(98), { items }))).toEqual([404, "NOT_FOUND"]);
    expect(refusal(await store.openReviewRound(project.id, {}))).toEqual([
      422,
      "VALIDATION_FAILED",
    ]);
    expect(
      refusal(await store.openReviewRound(project.id, { items: [items[0], items[0]] })),
    ).toEqual([422, "VALIDATION_FAILED"]);
    expect(
      refusal(
        await store.openReviewRound(project.id, {
          items: [items[0], { ...items[1]!, version: "1" }],
        }),
      ),
    ).toEqual([422, "VALIDATION_FAILED"]);
  });
});

describe("a set's failed check (POST /design-projects/{id}/preflight-failures)", () => {
  const issue = (message: string) => ({ ruleId: "LOW_DPI", level: "fail", message });

  it("records BATCH_PREFLIGHT_FAILED with the issues of each design, and changes no design", async () => {
    const store = await makeStore();
    const { project, a, b } = await readySet(store);
    const before = [await designOf(store, a), await designOf(store, b)];

    const result = await store.recordSetPreflightFailure(project.id, {
      items: [
        { designId: a, issues: [issue("Ảnh mờ"), issue("Chữ quá nhỏ")] },
        { designId: b, issues: [issue("Tràn vùng in")] },
      ],
    });

    expect(result.status).toBe(201);
    const event = data<ProjectEvent>(result);
    expect(event).toMatchObject({
      type: "BATCH_PREFLIGHT_FAILED",
      version: 0,
      note: `${a}: Ảnh mờ; Chữ quá nhỏ | ${b}: Tràn vùng in`,
    });
    expect(await batchEvents(store, project.id)).toEqual([event]);
    await expectUnchanged(store, project.id, before);
  });

  it("refuses an unknown project, items not well formed, a design of another project and a closed project", async () => {
    const store = await makeStore();
    const { project, a } = await readySet(store);
    const other = await draftIn(store, (await newProject(store, "Khác")).id, "Ly khác");
    const ok1 = { designId: a, issues: [issue("Ảnh mờ")] };

    expect(refusal(await store.recordSetPreflightFailure(uuid(97), { items: [ok1] }))).toEqual([
      404,
      "NOT_FOUND",
    ]);
    for (const body of [{}, { items: [] }, { items: [{ designId: a, issues: [] }] }]) {
      expect(refusal(await store.recordSetPreflightFailure(project.id, body))).toEqual([
        422,
        "VALIDATION_FAILED",
      ]);
    }
    const outside = await store.recordSetPreflightFailure(project.id, {
      items: [ok1, { designId: other, issues: [issue("Ảnh mờ")] }],
    });
    expect(refusal(outside)).toEqual([422, "DESIGN_NOT_IN_PROJECT"]);
    expect(errorOf(outside).details?.designIds).toEqual([other]);
    settle(await store.archiveProject(project.id, { version: 0 }));
    expect(refusal(await store.recordSetPreflightFailure(project.id, { items: [ok1] }))).toEqual([
      409,
      "PROJECT_ARCHIVED",
    ]);
    expect(await batchEvents(store, project.id)).toEqual([]);
  });
});

describe("uploads no round took (A-E4)", () => {
  it("are discarded after 24 hours with their files; those a round took, or younger ones, stay", async () => {
    const { storage, blobKeys } = trackedStorage();
    const store = await makeStore(storage);
    const { project, a, b, items } = await readySet(store);
    await store.openReviewRound(project.id, { items });
    const c = await draftIn(store, project.id, "Hộp");
    const d = await draftIn(store, project.id, "Ly nhỏ");
    const old = await uploaded(store, c);
    const roundFiles = data<DesignFileDto[]>(await store.files(a));

    store.later(DAY_MS - 60_000);
    const young = await uploaded(store, d);
    store.later(2 * 60_000); // `old` is now past 24 hours, `young` is not
    await store.listProjects();

    const uploads = stored(await store.storage.load())?.submissionUploads ?? [];
    expect(uploads.map((upload) => upload.designId).toSorted()).toEqual([a, b, d].toSorted());
    expect(blobKeys().filter((key) => key.includes(old.uploadToken))).toEqual([]);
    expect(blobKeys().filter((key) => key.includes(young.uploadToken))).toHaveLength(3);
    expect(data<DesignFileDto[]>(await store.files(a))).toEqual(roundFiles);
    // A round can no longer take the discarded upload.
    const late = await store.openReviewRound(project.id, { items: [old, young] });
    expect(refusal(late)).toEqual([422, "UPLOAD_INVALID"]);
    expect(errorOf(late).details?.designIds).toEqual([c]);
  });

  it("a snapshot stored before rounds existed loads with none", async () => {
    const storage = createMemoryStorage();
    const { state } = await seedDesignState(new Date(T0));
    const { reviewRounds: _r, submissionUploads: _u, ...older } = state;
    await storage.save({ rows: older });
    const store = await makeStore(storage);

    const { project, items } = await readySet(store);

    expect((await store.openReviewRound(project.id, { items })).status).toBe(201);
  });
});

/* ── Reading the storage ── */

type StoredUpload = { designId: string; token: string; files: Array<{ key: string }> };

function stored(snapshot: { rows: Record<string, unknown> } | null) {
  return snapshot?.rows as { submissionUploads: StoredUpload[] } | undefined;
}

/* ── Review of a round (Task 11, the reviewer simulation) ── */

type RoundReview = {
  roundId: string;
  approved: string[];
  failed: Array<{ designId: string; reason: string }>;
  closed: boolean;
};
type OpenRounds = {
  rounds: Array<{
    id: string;
    projectId: string;
    projectName: string;
    openedAt: string;
    designs: Array<{ id: string; name: string; status: string; failNext: boolean }>;
  }>;
};

/** A project with three filled drafts, all sent in one round. */
async function openedRound(store: Store) {
  const project = await newProject(store);
  const ids = [
    await draftIn(store, project.id, "Ly 12oz"),
    await draftIn(store, project.id, "Túi"),
    await draftIn(store, project.id, "Hộp"),
  ] as const;
  const items = [];
  for (const id of ids) items.push(await uploaded(store, id));
  const round = data<Round>(await store.openReviewRound(project.id, { items }));
  return { project, round, ids };
}
const roundOf = async (store: Store, id: string) =>
  storedRounds(await store.storage.load())?.reviewRounds.find((row) => row.id === id);
const closedEvents = async (store: Store, projectId: string) =>
  (await projectEvents(store, projectId)).filter((event) => event.type === "BATCH_CLOSED");
const failNextOf = async (store: Store, id: string) =>
  data<OpenRounds>(await store.simulateRounds())
    .rounds.flatMap((round) => round.designs)
    .find((design) => design.id === id)?.failNext;

describe("deciding the designs of a round", () => {
  it("approving and returning keep the single-design rules, and the round closes on the last decision", async () => {
    const store = await makeStore();
    const { project, round, ids } = await openedRound(store);
    const [a, b, c] = ids;

    settle(await store.simulateApprove(a));
    expect(await closedEvents(store, project.id)).toEqual([]);
    expect((await roundOf(store, round.id))?.closedAt).toBeNull();
    // BR-06: a return still needs its reason.
    expect(refusal(await store.simulateReturn(b, { reason: " " }))).toEqual([
      422,
      "VALIDATION_FAILED",
    ]);
    settle(await store.simulateReturn(b, { reason: "Logo bị mờ" }));
    expect((await roundOf(store, round.id))?.closedAt).toBeNull();
    expect(data<Project>(await store.getProject(project.id)).openRound?.id).toBe(round.id);

    settle(await store.simulateApprove(c));

    expect((await roundOf(store, round.id))?.closedAt).not.toBeNull();
    expect(data<Project>(await store.getProject(project.id)).openRound).toBeNull();
    const [closed, ...rest] = await closedEvents(store, project.id);
    expect(rest).toEqual([]);
    expect(closed!.note).toBe(
      `${round.id}: ${a} APPROVED, ${b} RETURNED (Logo bị mờ), ${c} APPROVED`,
    );
    expect((await designOf(store, b)).status).toBe("DRAFT");
  });

  it("a design outside any round is decided as before, and closes nothing", async () => {
    const store = await makeStore();
    const { project, round } = await openedRound(store);
    const extra = await draftIn(store, project.id, "Khác");
    const other = await draftIn(store, project.id, "Khác nữa");
    const second = data<Round>(
      await store.openReviewRound(project.id, {
        items: [await uploaded(store, extra), await uploaded(store, other)],
      }),
    );

    settle(await store.simulateApprove(extra));

    expect((await roundOf(store, second.id))?.closedAt).toBeNull();
    expect((await roundOf(store, round.id))?.closedAt).toBeNull();
    expect(await closedEvents(store, project.id)).toEqual([]);
  });
});

describe("Duyệt tất cả and the failure switch (Q5)", () => {
  it("a design switched to fail stays PENDING_REVIEW, the others are approved, the round stays open", async () => {
    const store = await makeStore();
    const { project, round, ids } = await openedRound(store);
    const [a, b, c] = ids;
    settle(await store.simulateFailNextApproval(b, { enabled: true }));

    const review = data<RoundReview>(settle(await store.simulateApproveRound(round.id)));

    expect(review.approved).toEqual([a, c]);
    expect(review.failed).toHaveLength(1);
    expect(review.failed[0]).toMatchObject({ designId: b });
    expect(review.failed[0]!.reason).not.toBe("");
    expect(review.closed).toBe(false);
    expect((await designOf(store, b)).status).toBe("PENDING_REVIEW");
    expect((await designOf(store, a)).status).toBe("APPROVED");
    expect((await designOf(store, c)).status).toBe("APPROVED");
    expect((await roundOf(store, round.id))?.closedAt).toBeNull();
    expect(await closedEvents(store, project.id)).toEqual([]);
  });

  it("the switch clears after one failure: the next approval succeeds and closes the round", async () => {
    const store = await makeStore();
    const { project, round, ids } = await openedRound(store);
    const b = ids[1];
    settle(await store.simulateFailNextApproval(b, { enabled: true }));
    settle(await store.simulateApproveRound(round.id));
    expect(await failNextOf(store, b)).toBe(false);

    settle(await store.simulateApprove(b));

    expect((await designOf(store, b)).status).toBe("APPROVED");
    expect((await roundOf(store, round.id))?.closedAt).not.toBeNull();
    const [closed] = await closedEvents(store, project.id);
    expect(closed!.note).toContain(`${b} APPROVED`);
  });

  it("a single approval of a switched design fails the same way, and changes nothing else", async () => {
    const store = await makeStore();
    const { ids } = await openedRound(store);
    const a = ids[0];
    settle(await store.simulateFailNextApproval(a, { enabled: true }));
    const before = await designOf(store, a);

    const failed = await store.simulateApprove(a);

    expect(refusal(failed)).toEqual([409, "APPROVAL_FAILED"]);
    expect(await designOf(store, a)).toEqual(before);
    expect(await failNextOf(store, a)).toBe(false);
  });

  it("the switch can be turned off again, and is refused for an unknown design or a bad body", async () => {
    const store = await makeStore();
    const { ids } = await openedRound(store);
    settle(await store.simulateFailNextApproval(ids[0], { enabled: true }));
    expect(await failNextOf(store, ids[0])).toBe(true);
    settle(await store.simulateFailNextApproval(ids[0], { enabled: false }));
    expect(await failNextOf(store, ids[0])).toBe(false);

    expect(refusal(await store.simulateFailNextApproval(uuid(1), { enabled: true }))).toEqual([
      404,
      "NOT_FOUND",
    ]);
    expect(refusal(await store.simulateFailNextApproval(ids[0], { enabled: "yes" }))).toEqual([
      422,
      "VALIDATION_FAILED",
    ]);
  });

  it("approves a whole round when nothing fails, and closes it with the results", async () => {
    const store = await makeStore();
    const { project, round, ids } = await openedRound(store);

    const review = data<RoundReview>(settle(await store.simulateApproveRound(round.id)));

    expect(review).toMatchObject({ approved: [...ids], failed: [], closed: true });
    const [closed] = await closedEvents(store, project.id);
    expect(closed!.note).toBe(`${round.id}: ${ids.map((id) => `${id} APPROVED`).join(", ")}`);
    expect(refusal(await store.simulateApproveRound(round.id))).toEqual([409, "INVALID_STATE"]);
    expect(refusal(await store.simulateApproveRound(uuid(2)))).toEqual([404, "NOT_FOUND"]);
  });
});

describe("the open rounds, for the panel", () => {
  it("lists a round with its project name, opened time and designs, until it closes", async () => {
    const store = await makeStore();
    const { round, ids } = await openedRound(store);

    const [listed] = data<OpenRounds>(await store.simulateRounds()).rounds;
    expect(listed).toMatchObject({
      id: round.id,
      projectName: "Quán Hoa",
      openedAt: round.openedAt,
    });
    expect(listed!.designs.map((d) => [d.id, d.name, d.status, d.failNext])).toEqual([
      [ids[0], "Ly 12oz", "PENDING_REVIEW", false],
      [ids[1], "Túi", "PENDING_REVIEW", false],
      [ids[2], "Hộp", "PENDING_REVIEW", false],
    ]);

    settle(await store.simulateApproveRound(round.id));
    expect(data<OpenRounds>(await store.simulateRounds()).rounds).toEqual([]);
  });
});

describe("a returned design goes on as a draft", () => {
  /** Sends a draft alone, as the studio's Gửi duyệt does. */
  async function submitAlone(store: Store, id: string) {
    const { version } = await designOf(store, id);
    const { files, checksums } = await bundle(`alone-${id}`);
    return store.submit(id, { version, preflight: PASS, checksums, files });
  }

  it("can be submitted alone", async () => {
    const store = await makeStore();
    const { round, ids } = await openedRound(store);
    settle(await store.simulateReturn(ids[0], { reason: "Sửa lại" }));

    settle(await submitAlone(store, ids[0]));

    expect((await designOf(store, ids[0])).status).toBe("PENDING_REVIEW");
    // The first round still waits for the others; this design is decided there (returned).
    expect((await roundOf(store, round.id))?.closedAt).toBeNull();
  });

  it("can join a new round; the old round closes when the others are decided", async () => {
    const store = await makeStore();
    const { project, round, ids } = await openedRound(store);
    const [a, b, c] = ids;
    settle(await store.simulateReturn(a, { reason: "Sửa lại" }));
    const d = await draftIn(store, project.id, "Mới");
    const second = data<Round>(
      settle(
        await store.openReviewRound(project.id, {
          items: [await uploaded(store, a, "again"), await uploaded(store, d)],
        }),
      ),
    );
    expect((await designOf(store, a)).status).toBe("PENDING_REVIEW");

    settle(await store.simulateApprove(b));
    settle(await store.simulateApprove(c));

    // `a` was decided in the first round (returned) and now waits in the second.
    expect((await roundOf(store, round.id))?.closedAt).not.toBeNull();
    expect((await roundOf(store, second.id))?.closedAt).toBeNull();
    const [closed] = await closedEvents(store, project.id);
    expect(closed!.note).toBe(`${round.id}: ${a} RETURNED (Sửa lại), ${b} APPROVED, ${c} APPROVED`);
    expect(data<Project>(await store.getProject(project.id)).openRound?.id).toBe(second.id);

    settle(await store.simulateApproveRound(second.id));
    expect((await roundOf(store, second.id))?.closedAt).not.toBeNull();
  });
});

function storedRounds(snapshot: { rows: Record<string, unknown> } | null) {
  return snapshot?.rows as { reviewRounds: Round[] } | undefined;
}

/* ── Final review fixes (findings 1, 2, 4, 8, 9) ── */

describe("the open round the project page shows (final review 1)", () => {
  it("names only the designs still waiting, after an approval and after a return", async () => {
    const store = await makeStore();
    const { project, round, ids } = await openedRound(store);
    const [a, b, c] = ids;

    settle(await store.simulateApprove(a));
    const afterApprove = data<Project>(await store.getProject(project.id)).openRound;
    expect(afterApprove).toEqual({ id: round.id, designIds: [b, c], openedAt: round.openedAt });

    settle(await store.simulateReturn(b, { reason: "Sửa" }));
    expect(data<Project>(await store.getProject(project.id)).openRound?.designIds).toEqual([c]);
  });

  it("a returned design sent again alone is not counted in the first round", async () => {
    const store = await makeStore();
    const { project, ids } = await openedRound(store);
    const [a, b, c] = ids;
    settle(await store.simulateReturn(a, { reason: "Sửa" }));
    const { version } = await designOf(store, a);
    const { files, checksums } = await bundle("alone-again");
    settle(await store.submit(a, { version, preflight: PASS, checksums, files }));

    expect(data<Project>(await store.getProject(project.id)).openRound?.designIds).toEqual([b, c]);
  });

  it("with several rounds open, shows the oldest one with its waiting designs; the next once it closes", async () => {
    const store = await makeStore();
    const { project, round, ids } = await openedRound(store);
    const [a, b, c] = ids;
    settle(await store.simulateReturn(a, { reason: "Sửa" }));
    const d = await draftIn(store, project.id, "Mới");
    const second = data<Round>(
      settle(
        await store.openReviewRound(project.id, {
          items: [await uploaded(store, a, "again"), await uploaded(store, d)],
        }),
      ),
    );

    settle(await store.simulateApprove(b));
    const first = data<Project>(await store.getProject(project.id)).openRound;
    expect(first).toEqual({ id: round.id, designIds: [c], openedAt: round.openedAt });

    settle(await store.simulateApprove(c));
    expect(data<Project>(await store.getProject(project.id)).openRound).toEqual({
      id: second.id,
      designIds: [a, d],
      openedAt: second.openedAt,
    });
  });
});

describe("BATCH_CLOSED records each design's decision in that round (final review 2)", () => {
  it("a design returned in the round and approved elsewhere before it closes is still RETURNED there", async () => {
    const store = await makeStore();
    const { project, round, ids } = await openedRound(store);
    const [a, b, c] = ids;
    settle(await store.simulateReturn(a, { reason: "Logo mờ" }));
    const { version } = await designOf(store, a);
    const { files, checksums } = await bundle("alone-decided");
    settle(await store.submit(a, { version, preflight: PASS, checksums, files }));
    settle(await store.simulateApprove(a));
    settle(await store.simulateApprove(b));
    settle(await store.simulateApprove(c));

    const [closed, ...rest] = await closedEvents(store, project.id);
    expect(rest).toEqual([]);
    expect(closed!.note).toBe(`${round.id}: ${a} RETURNED (Logo mờ), ${b} APPROVED, ${c} APPROVED`);
  });
});

describe("a round refused by the server's own check (final review 4)", () => {
  it("records PREFLIGHT_FAILED on the design that failed, not on the others", async () => {
    const store = await makeStore();
    const project = await newProject(store);
    const a = await draftIn(store, project.id, "Ly");
    const empty = await draftIn(store, project.id, "Trống", false);
    const items = [await uploaded(store, a), await uploaded(store, empty)];

    const refused = await store.openReviewRound(project.id, { items });
    expect(refusal(refused)).toEqual([422, "PREFLIGHT_FAILED"]);

    const failed = data<DesignEventDto[]>(await store.history(empty)).at(-1);
    expect(failed).toMatchObject({ type: "PREFLIGHT_FAILED" });
    expect(failed?.note).toContain("chưa có nội dung");
    const passed = data<DesignEventDto[]>(await store.history(a)).map((event) => event.type);
    expect(passed).not.toContain("PREFLIGHT_FAILED");
    expect((await designOf(store, empty)).version).toBe(0);
  });

  it("leaves the browser's own Fail to its own record: the design's history is not written twice", async () => {
    const store = await makeStore();
    const project = await newProject(store);
    const a = await draftIn(store, project.id, "Ly");
    const b = await draftIn(store, project.id, "Túi");
    const items = [await uploaded(store, a), await uploaded(store, b)];
    const fail = { result: "Fail", issues: [{ ruleId: "LOW_DPI", level: "fail", message: "Mờ" }] };

    await store.openReviewRound(project.id, {
      items: [{ ...items[0]!, preflight: fail }, items[1]],
    });

    const types = data<DesignEventDto[]>(await store.history(a)).map((event) => event.type);
    expect(types).not.toContain("PREFLIGHT_FAILED");
  });
});

describe("the failure switch (final review 8)", () => {
  const storedRows = async (store: Store) =>
    (await store.storage.load())?.rows as unknown as { failNextApproval: string[] };

  it("is refused for a design that is not waiting for review", async () => {
    const store = await makeStore();
    const project = await newProject(store);
    const draft = await draftIn(store, project.id, "Ly");

    const refused = await store.simulateFailNextApproval(draft, { enabled: true });

    expect(refusal(refused)).toEqual([409, "INVALID_STATE"]);
    expect((await storedRows(store)).failNextApproval).toEqual([]);
  });

  it("is dropped when the design is returned, so a later round starts without it", async () => {
    const store = await makeStore();
    const { ids } = await openedRound(store);
    const a = ids[0];
    settle(await store.simulateFailNextApproval(a, { enabled: true }));
    expect((await storedRows(store)).failNextApproval).toEqual([a]);

    settle(await store.simulateReturn(a, { reason: "Sửa" }));

    expect((await storedRows(store)).failNextApproval).toEqual([]);
  });
});

describe("the uploads of a closed round (final review 9)", () => {
  it("are dropped when the round closes, while the designs keep their files", async () => {
    const { storage, blobKeys } = trackedStorage();
    const store = await makeStore(storage);
    const { round, ids } = await openedRound(store);
    expect(stored(await store.storage.load())?.submissionUploads).toHaveLength(3);
    const filesBefore = data<DesignFileDto[]>(await store.files(ids[0]));
    const blobsBefore = blobKeys();

    settle(await store.simulateApproveRound(round.id));

    expect(stored(await store.storage.load())?.submissionUploads).toEqual([]);
    expect(data<DesignFileDto[]>(await store.files(ids[0]))).toEqual(filesBefore);
    expect(blobKeys()).toEqual(blobsBefore);
  });

  it("stay while the round is open", async () => {
    const store = await makeStore();
    const { ids } = await openedRound(store);
    settle(await store.simulateApprove(ids[0]));
    expect(stored(await store.storage.load())?.submissionUploads).toHaveLength(3);
  });
});

const LIBRARY_STYLE = {
  fontCode: "be-vietnam-pro",
  sizePt: 24,
  color: "#112233",
  bold: true,
  italic: false,
  align: "center",
  letterSpacingEm: 0.05,
  lineHeight: 1.2,
  outline: { color: "#FFFFFF", widthMm: 0.5 },
};

describe("the snapshot and the switch (final review 10)", () => {
  const rowsOf = async (storage: DesignMockStorage) =>
    (await storage.load())!.rows as Record<string, unknown>;

  it("the failure switch survives a reload: a second store over the same storage fails that approval", async () => {
    const storage = createMemoryStorage();
    const first = await makeStore(storage);
    const { ids } = await openedRound(first);
    settle(await first.simulateFailNextApproval(ids[1], { enabled: true }));

    const second = await makeStore(storage);

    expect(await failNextOf(second, ids[1])).toBe(true);
    expect(refusal(await second.simulateApprove(ids[1]))).toEqual([409, "APPROVAL_FAILED"]);
    expect(await failNextOf(second, ids[1])).toBe(false);
  });

  it("a snapshot lacking every later collection loads: approving and projects work, nothing 500s", async () => {
    const storage = createMemoryStorage();
    const { state } = await seedDesignState(new Date(T0));
    const {
      projects: _p,
      projectEvents: _e,
      library: _l,
      reviewRounds: _r,
      submissionUploads: _u,
      failNextApproval: _f,
      ...older
    } = state;
    await storage.save({ rows: { ...older, seq: { design: state.seq.design } } });
    const store = await makeStore(storage);

    expect(
      data<DesignDto>(settle(await store.simulateApprove(MOCK_DESIGN_IDS.pending))).status,
    ).toBe("APPROVED");
    const project = await newProject(store);
    expect(project.status).toBe("ACTIVE");
    expect(data<unknown[]>(await store.projectHistory(project.id))).toHaveLength(1);
  });

  it("reset over a store that holds projects, rounds, uploads and a switch leaves every collection empty", async () => {
    const storage = createMemoryStorage();
    const store = await makeStore(storage);
    const { project, ids } = await openedRound(store);
    settle(await store.simulateFailNextApproval(ids[0], { enabled: true }));
    settle(await store.saveLibraryText(project.id, { text: "Nhà Mình", style: LIBRARY_STYLE }));

    settle(await store.reset());

    const rows = await rowsOf(storage);
    for (const key of [
      "projects",
      "projectEvents",
      "library",
      "reviewRounds",
      "submissionUploads",
      "failNextApproval",
    ]) {
      expect(rows[key], key).toEqual([]);
    }
  });
});
