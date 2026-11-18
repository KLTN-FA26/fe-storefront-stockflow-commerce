import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/error";

import * as api from "../api";
import type { AutosaveState } from "../autosave";
import type { ExportRenderer } from "../components/studio/export-renderer";
import { StudioProvider, type StudioServices } from "../components/studio/studio-context";
import { DocumentChangedError, DocumentEditedError } from "../components/studio/submission-checks";
import { useDesignSubmission } from "../components/studio/use-design-submission";
import {
  addElement,
  createEditor,
  createSurfaces,
  documentChecksum,
  emptyDocument,
} from "../engine";
import { cup12oz, FONTS, PNG_1x1, sizer, textEl } from "../engine/__tests__/fixtures";
import * as steps from "../components/submit-set-steps";
import { designKeys } from "../queries";
import type { Design } from "../types";
import { printConfigSchema } from "../schemas";
import { design as designOf, documentRecordDto, printConfigDto } from "./fixtures";
// The print file needs its colour profiles: jsdom serves no `public/` files.
vi.mock(
  "../components/studio/print-profiles",
  async () => (await import("./print-profiles-stub")).printProfilesStub,
);

vi.mock("../api", () => ({
  getDesign: vi.fn(),
  getDesignDocument: vi.fn(),
  getDesignPrintConfig: vi.fn(),
  submitDesign: vi.fn(),
  uploadDesignFiles: vi.fn(),
  readDesignVersion: vi.fn(),
  requestReview: vi.fn(),
  recordPreflightFailure: vi.fn(),
}));
// These tests prove the submission's steps, not the PDFs: the bundle builder still runs every step,
// but the two PDFs are stand-in bytes. Loading pdf-lib cold and building them inside the first
// submitting test went past its 5 s under a loaded full run (and its unfinished run then broke the
// tests after it). The real PDFs are built by `submission-bundle.test.ts` and the engine's tests.
vi.mock("../engine", async (importOriginal) => {
  const engine = await importOriginal<typeof import("../engine")>();
  const pdf = async () => new TextEncoder().encode("%PDF-1.7 stand-in");
  return { ...engine, buildPrintPdf: pdf, buildSheetPdf: pdf };
});
// Only the redraw on a changed template draws on a session of its own (`drawDesign`): jsdom has no
// canvas for it, so its answer is the test's.
vi.mock("../components/submit-set-steps", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../components/submit-set-steps")>()),
  drawDesign: vi.fn(),
}));
const drawDesign = vi.mocked(steps.drawDesign);
const getDesign = vi.mocked(api.getDesign);
const getDesignDocument = vi.mocked(api.getDesignDocument);
const getDesignPrintConfig = vi.mocked(api.getDesignPrintConfig);
const submitDesign = vi.mocked(api.submitDesign);
const uploadDesignFiles = vi.mocked(api.uploadDesignFiles);
const readDesignVersion = vi.mocked(api.readDesignVersion);
const requestReview = vi.mocked(api.requestReview);
const recordPreflightFailure = vi.mocked(api.recordPreflightFailure);

type DocumentRecord = Awaited<ReturnType<typeof api.getDesignDocument>>;

const draft = designOf({ version: 3 });
const pending = designOf({ status: "PENDING_REVIEW", version: 4 });
const label = textEl("t", {
  content: "Cà phê",
  placement: { u: 170, v: 55, rotationDeg: 0, scale: 1 },
});

const fakeRenderer = () => ({
  preview: vi.fn<ExportRenderer["preview"]>(async () => PNG_1x1),
  printSurface: vi.fn<ExportRenderer["printSurface"]>(async () => [{ png: PNG_1x1, heightPx: 1 }]),
  printVector: vi.fn<ExportRenderer["printVector"]>(async () => null),
  printSlug: vi.fn<ExportRenderer["printSlug"]>(async () => PNG_1x1),
  designBrief: vi.fn<ExportRenderer["designBrief"]>(async () => [PNG_1x1]),
  release: vi.fn<ExportRenderer["release"]>(),
});

/**
 * The hook inside a studio whose services are the subset it reads, cast once at this boundary
 * (`as unknown as`): the rest of `StudioServices` is not needed here.
 */
async function setup(
  opts: {
    filled?: boolean;
    autosaveState?: AutosaveState;
    printConfig?: Record<string, unknown>;
  } = {},
) {
  const { filled = true, autosaveState = "saved" } = opts;
  const editor = createEditor({ template: cup12oz, document: emptyDocument(cup12oz) });
  if (filled) editor.apply((doc) => addElement(doc, "BODY", label));
  const document = editor.store.getState().document;
  const checksum = await documentChecksum(document);
  getDesignDocument.mockResolvedValue(
    documentRecordDto({ version: 3, checksum }) as DocumentRecord,
  );
  getDesign.mockResolvedValue(draft);

  const calls: string[] = [];
  const autosave = {
    flush: vi.fn(async () => void calls.push("flush")),
    setVersion: vi.fn<(version: number) => void>(),
    resume: vi.fn(),
    conflict: vi.fn(),
    latestState: vi.fn((): AutosaveState => autosaveState),
    // This tab last loaded or saved the document it holds.
    storedChecksum: vi.fn(() => checksum),
  };
  const renderer = fakeRenderer();
  const services = {
    editor,
    template: cup12oz,
    surfaces: createSurfaces(cup12oz),
    sizer,
    fonts: FONTS,
    assetStatus: {},
    fontStatus: {},
    autosave,
    exportRenderer: renderer,
    printConfig: printConfigSchema.parse(printConfigDto(opts.printConfig)),
    ownStatusMove: vi.fn(),
  } as unknown as StudioServices;
  // The template as the server has it now: the studio's own, unless a test says it changed.
  getDesignPrintConfig.mockResolvedValue(
    services.printConfig as Awaited<ReturnType<typeof api.getDesignPrintConfig>>,
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <StudioProvider value={services}>{children}</StudioProvider>
    </QueryClientProvider>
  );
  const view = renderHook(() => useDesignSubmission(draft), { wrapper });
  return { view, client, autosave, renderer, calls, editor, services };
}

/** This tab's editor changes the design: a second text on the body. */
const editIn = (editor: ReturnType<typeof createEditor>) =>
  editor.apply((doc) =>
    addElement(
      doc,
      "BODY",
      textEl("t2", { content: "Trà", placement: { u: 120, v: 55, rotationDeg: 0, scale: 1 } }),
    ),
  );

beforeEach(() => {
  vi.resetAllMocks();
});

describe("useDesignSubmission", () => {
  it("stops at a failing preflight: the failure is recorded, nothing is rendered or submitted", async () => {
    const { view, renderer } = await setup({ filled: false });
    recordPreflightFailure.mockResolvedValue(
      {} as Awaited<ReturnType<typeof recordPreflightFailure>>,
    );

    await act(() => view.result.current.run());

    expect(view.result.current.step).toBe("error");
    expect(view.result.current.issues?.map((i) => i.ruleId)).toEqual(["EMPTY_DESIGN"]);
    expect(recordPreflightFailure).toHaveBeenCalledTimes(1);
    expect(recordPreflightFailure).toHaveBeenCalledWith(draft.id, {
      version: 3,
      issues: view.result.current.issues,
    });
    expect(submitDesign).not.toHaveBeenCalled();
    expect(renderer.preview).not.toHaveBeenCalled();
  });

  it("re-reads the history once the failure is recorded, so Lịch sử lists it", async () => {
    const { view, client } = await setup({ filled: false });
    const invalidate = vi.spyOn(client, "invalidateQueries");
    recordPreflightFailure.mockResolvedValue(
      {} as Awaited<ReturnType<typeof recordPreflightFailure>>,
    );

    await act(() => view.result.current.run());

    expect(recordPreflightFailure).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: designKeys.history(draft.id) });
  });

  it("check() saves and runs the preflight only: a Pass answers true and draws nothing", async () => {
    const { view, renderer, autosave } = await setup();

    let passed: boolean | undefined;
    await act(async () => {
      passed = await view.result.current.check();
    });

    expect(passed).toBe(true);
    expect(autosave.flush).toHaveBeenCalledTimes(1);
    expect(view.result.current.step).toBe("idle");
    expect(view.result.current.issues).toBeNull();
    expect(renderer.preview).not.toHaveBeenCalled();
    expect(recordPreflightFailure).not.toHaveBeenCalled();
    expect(submitDesign).not.toHaveBeenCalled();
  });

  it("check() records a Fail and sets its issues", async () => {
    const { view, renderer } = await setup({ filled: false });
    recordPreflightFailure.mockResolvedValue(
      {} as Awaited<ReturnType<typeof recordPreflightFailure>>,
    );

    let passed: boolean | undefined;
    await act(async () => {
      passed = await view.result.current.check();
    });

    expect(passed).toBe(false);
    expect(view.result.current.step).toBe("error");
    expect(view.result.current.issues?.map((i) => i.ruleId)).toEqual(["EMPTY_DESIGN"]);
    expect(recordPreflightFailure).toHaveBeenCalledTimes(1);
    expect(renderer.preview).not.toHaveBeenCalled();
    expect(submitDesign).not.toHaveBeenCalled();
  });

  it.each([
    [{ hasCartonSpec: false }, "NO_CARTON_SPEC"],
    [{ variantStatus: "OBSOLETE" }, "VARIANT_UNAVAILABLE"],
  ])(
    "checks the variant against the print configuration (R6): %j fails with %s",
    async (printConfig, ruleId) => {
      const { view, renderer } = await setup({ printConfig });
      recordPreflightFailure.mockResolvedValue(
        {} as Awaited<ReturnType<typeof recordPreflightFailure>>,
      );

      await act(() => view.result.current.run());

      expect(view.result.current.step).toBe("error");
      expect(view.result.current.issues?.map((i) => i.ruleId)).toEqual([ruleId]);
      expect(submitDesign).not.toHaveBeenCalled();
      expect(renderer.preview).not.toHaveBeenCalled();
    },
  );

  it("flushes autosave, submits the version read after it with the three files, and holds the pending design", async () => {
    const { view, client, autosave, calls } = await setup();
    // Before the flush the edit is not stored yet: the record is one version behind the editor.
    const flushed = await getDesignDocument(draft.id);
    getDesignDocument.mockResolvedValue({ ...flushed, version: 2, checksum: "0".repeat(64) });
    autosave.flush.mockImplementation(async () => {
      calls.push("flush");
      getDesignDocument.mockResolvedValue({ ...flushed, version: 4 }); // the flush stored it
    });
    submitDesign.mockImplementation(async () => {
      calls.push("submit");
      return designOf({ status: "PENDING_REVIEW", version: 5 });
    });

    await act(() => view.result.current.run());

    expect(view.result.current.step).toBe("done");
    expect(view.result.current.issues).toBeNull();
    expect(calls).toEqual(["flush", "submit"]);
    const [id, input] = submitDesign.mock.calls[0]!;
    expect(id).toBe(draft.id);
    // The files are bound to the layout the flush stored (read after it, not the first one found).
    expect(input.documentChecksum).toBe((await getDesignDocument(draft.id)).checksum);
    expect(Object.keys(input.files).toSorted()).toEqual([
      "CUSTOMER_PREVIEW",
      "PRINT_READY",
      "TECHNICAL_SPEC",
    ]);
    expect(recordPreflightFailure).not.toHaveBeenCalled();
    expect(autosave.setVersion).toHaveBeenCalledWith(5);
    expect(client.getQueryData<Design>(designKeys.detail(draft.id))?.status).toBe("PENDING_REVIEW");
  });

  it("stops before sending, with no conflict, when this tab's editor changed the design and stored it meanwhile; sending again draws the new one", async () => {
    const { view, autosave, renderer, editor } = await setup();
    const drawn = await getDesignDocument(draft.id);
    renderer.printSurface.mockImplementationOnce(async () => {
      // While the files are drawn this tab edits, and its autosave stores the edit: the stored
      // checksum is the one this tab saved, which is what makes it an edit and not a conflict.
      editIn(editor);
      const checksum = await documentChecksum(editor.store.getState().document);
      getDesignDocument.mockResolvedValue({ ...drawn, version: 4, checksum });
      autosave.storedChecksum.mockReturnValue(checksum);
      return [{ png: PNG_1x1, heightPx: 1 }];
    });

    await act(() => view.result.current.run());

    expect(view.result.current.step).toBe("error");
    expect(view.result.current.error).toBeInstanceOf(DocumentEditedError);
    expect(autosave.conflict).not.toHaveBeenCalled();
    expect(submitDesign).not.toHaveBeenCalled();

    submitDesign.mockResolvedValue(designOf({ status: "PENDING_REVIEW", version: 5 }));
    await act(() => view.result.current.retry());

    expect(view.result.current.step).toBe("done");
    expect(renderer.preview).toHaveBeenCalledTimes(2);
    expect(submitDesign.mock.calls[0]![1].documentChecksum).toBe(
      (await getDesignDocument(draft.id)).checksum,
    ); // the edited document's, drawn on the retry
  });

  it("stops before sending, with no conflict, on an edit of this tab's editor still waiting to be saved", async () => {
    const { view, autosave, renderer, editor } = await setup();
    renderer.printSurface.mockImplementationOnce(async () => {
      editIn(editor); // the stored document is still the drawn one
      return [{ png: PNG_1x1, heightPx: 1 }];
    });

    await act(() => view.result.current.run());

    expect(view.result.current.step).toBe("error");
    expect(view.result.current.error).toBeInstanceOf(DocumentEditedError);
    expect(autosave.conflict).not.toHaveBeenCalled();
    expect(submitDesign).not.toHaveBeenCalled();
  });

  it.each([
    ["this tab stored", true, DocumentEditedError, 0],
    ["another tab stored", false, DocumentChangedError, 1],
  ])(
    "with the drawn document back in the editor (an edit, then its undo), a document %s meanwhile is told apart",
    async (_, ours, expected, conflicts) => {
      const { view, autosave, renderer, editor } = await setup();
      const drawn = await getDesignDocument(draft.id);
      renderer.printSurface.mockImplementationOnce(async () => {
        editIn(editor);
        const edited = await documentChecksum(editor.store.getState().document);
        editor.undo(); // the editor holds the very document drawn again
        const checksum = ours ? edited : "f".repeat(64);
        getDesignDocument.mockResolvedValue({ ...drawn, version: 4, checksum });
        if (ours) autosave.storedChecksum.mockReturnValue(edited);
        return [{ png: PNG_1x1, heightPx: 1 }];
      });

      await act(() => view.result.current.run());

      expect(view.result.current.error).toBeInstanceOf(expected);
      expect(autosave.conflict).toHaveBeenCalledTimes(conflicts);
      expect(submitDesign).not.toHaveBeenCalled();
    },
  );

  it("lets a save made elsewhere win over this tab's own edit in the same submission: the conflict, not Gửi lại", async () => {
    const { view, autosave, renderer, editor } = await setup();
    const drawn = await getDesignDocument(draft.id);
    renderer.printSurface.mockImplementationOnce(async () => {
      editIn(editor); // this tab edits, not saved yet…
      // …and another tab saves: a checksum neither drawn nor this tab's.
      getDesignDocument.mockResolvedValue({ ...drawn, version: 4, checksum: "f".repeat(64) });
      return [{ png: PNG_1x1, heightPx: 1 }];
    });

    await act(() => view.result.current.run());

    expect(view.result.current.error).toBeInstanceOf(DocumentChangedError);
    expect(autosave.conflict).toHaveBeenCalledTimes(1);
    expect(submitDesign).not.toHaveBeenCalled();
  });

  it("asks to send again when this tab's own save of the edit is still under way: the unknown checksum may be its own", async () => {
    const { view, autosave, renderer, editor } = await setup();
    const drawn = await getDesignDocument(draft.id);
    renderer.printSurface.mockImplementationOnce(async () => {
      editIn(editor);
      autosave.latestState.mockReturnValue("saving"); // stored, not answered yet
      getDesignDocument.mockResolvedValue({ ...drawn, version: 4, checksum: "f".repeat(64) });
      return [{ png: PNG_1x1, heightPx: 1 }];
    });

    await act(() => view.result.current.run());

    expect(view.result.current.error).toBeInstanceOf(DocumentEditedError);
    expect(autosave.conflict).not.toHaveBeenCalled();
    expect(submitDesign).not.toHaveBeenCalled();
  });

  it("refuses to go on when autosave did not store the document", async () => {
    const { view } = await setup({ autosaveState: "error" });

    await act(() => view.result.current.run());

    expect(view.result.current.step).toBe("error");
    expect(submitDesign).not.toHaveBeenCalled();
  });

  it("submits nothing and sends autosave to conflict when the stored document is not the rendered one", async () => {
    const { view, autosave } = await setup();
    getDesignDocument.mockResolvedValue(
      documentRecordDto({ version: 3, checksum: "0".repeat(64) }) as DocumentRecord,
    );

    await act(() => view.result.current.run());

    expect(view.result.current.step).toBe("error");
    expect(autosave.conflict).toHaveBeenCalledTimes(1);
    expect(submitDesign).not.toHaveBeenCalled();
  });

  it("shows the issues of a server 422 PREFLIGHT_FAILED", async () => {
    const { view } = await setup();
    // The BE's finding: `rule`, no level, an English message that is never shown.
    submitDesign.mockRejectedValue(
      new ApiError(422, "DESIGN_PREFLIGHT_FAILED", "failed", undefined, undefined, {
        issues: [
          {
            rule: "OUTSIDE_PRINT_AREA",
            surfaceCode: "BODY",
            elementId: "t",
            message: "The element lies outside the print area",
          },
        ],
      }),
    );

    await act(() => view.result.current.run());

    expect(view.result.current.step).toBe("error");
    expect(view.result.current.issues).toEqual([
      {
        ruleId: "OUTSIDE_PRINT_AREA",
        level: "fail",
        message: "Phần tử nằm ngoài vùng in và sẽ bị cắt mất.",
        surfaceCode: "BODY",
        elementId: "t",
      },
    ]);
    // The BE put it on the history itself: the studio does not record it again.
    expect(recordPreflightFailure).not.toHaveBeenCalled();
  });

  it("shows a server issue of a rule the engine does not know", async () => {
    const { view } = await setup();
    const added = { rule: "BLEED_MISSING", message: "The bleed is missing" };
    submitDesign.mockRejectedValue(
      new ApiError(422, "DESIGN_PREFLIGHT_FAILED", "failed", undefined, undefined, {
        issues: [added],
      }),
    );

    await act(() => view.result.current.run());

    // A generic sentence and the rule code; never the BE's English.
    expect(view.result.current.issues).toEqual([
      {
        ruleId: "BLEED_MISSING",
        level: "fail",
        message: "Thiết kế chưa đạt một kiểm tra tự động (mã: BLEED_MISSING).",
      },
    ]);
  });

  it("draws anew on Thử lại after any 422 DESIGN_PREFLIGHT_FAILED, even one whose issues it cannot read", async () => {
    const { view, renderer } = await setup();
    submitDesign.mockRejectedValueOnce(
      new ApiError(422, "DESIGN_PREFLIGHT_FAILED", "failed", undefined, undefined, { issues: "x" }),
    );
    submitDesign.mockResolvedValueOnce(pending);

    await act(() => view.result.current.run());
    expect(view.result.current.step).toBe("error");
    expect(view.result.current.issues).toBeNull();

    await act(() => view.result.current.retry());

    await waitFor(() => expect(view.result.current.step).toBe("done"));
    // The same bundle would meet the same 422: the retry checked and drew it again.
    expect(renderer.preview).toHaveBeenCalledTimes(2);
    expect(submitDesign.mock.calls[1]![1].files).not.toBe(submitDesign.mock.calls[0]![1].files);
  });

  describe("a 409 DESIGN_FILES_OUTDATED", () => {
    const outdated = (roles: string[]) =>
      new ApiError(409, "DESIGN_FILES_OUTDATED", "outdated", undefined, undefined, { roles });

    it("draws the files again, uploads the roles it names, reads the version and asks once more", async () => {
      const { view, renderer } = await setup();
      submitDesign.mockRejectedValueOnce(outdated(["PRINT_READY"]));
      readDesignVersion.mockResolvedValue(8);
      requestReview.mockResolvedValue(designOf({ status: "PENDING_REVIEW", version: 9 }));

      await act(() => view.result.current.run());

      expect(view.result.current.step).toBe("done");
      expect(submitDesign).toHaveBeenCalledTimes(1);
      expect(renderer.preview).toHaveBeenCalledTimes(2); // drawn again
      const [id, files, checksum, runNonce, roles] = uploadDesignFiles.mock.calls[0]!;
      expect(id).toBe(draft.id);
      expect(roles).toEqual(["PRINT_READY"]);
      expect(checksum).toBe(submitDesign.mock.calls[0]![1].documentChecksum);
      expect(files).not.toBe(submitDesign.mock.calls[0]![1].files);
      // New files are a new upload: a nonce of their own, so equal bytes are not a replay.
      expect(runNonce).not.toBe(submitDesign.mock.calls[0]![1].runNonce);
      expect(requestReview).toHaveBeenCalledWith(draft.id, 8);
      expect(recordPreflightFailure).not.toHaveBeenCalled();
      // The template is read afresh before the files are drawn again (SF4 ruling).
      expect(getDesignPrintConfig).toHaveBeenCalledTimes(1);
      expect(getDesignPrintConfig.mock.invocationCallOrder[0]!).toBeLessThan(
        renderer.preview.mock.invocationCallOrder[1]!,
      );
    });

    it("asks the customer to try again when it is refused a second time, and draws anew then", async () => {
      const { view, renderer } = await setup();
      submitDesign.mockRejectedValueOnce(outdated(["PRINT_READY", "TECHNICAL_SPEC"]));
      readDesignVersion.mockResolvedValue(8);
      const again = outdated(["PRINT_READY"]);
      requestReview.mockRejectedValueOnce(again);

      await act(() => view.result.current.run());

      expect(view.result.current.step).toBe("error");
      expect(view.result.current.error).toBe(again);
      expect(requestReview).toHaveBeenCalledTimes(1); // once, not a loop

      submitDesign.mockResolvedValueOnce(pending);
      await act(() => view.result.current.retry());

      expect(view.result.current.step).toBe("done");
      expect(renderer.preview).toHaveBeenCalledTimes(3); // the retry drew a third time
    });

    it("goes to the conflict dialog, drawing and uploading nothing, when the layout was saved elsewhere meanwhile", async () => {
      const { view, autosave, renderer } = await setup();
      const good = await getDesignDocument(draft.id);
      // The BE found the files outdated because another tab saved: the stored layout moved on.
      submitDesign.mockImplementationOnce(async () => {
        getDesignDocument.mockResolvedValue({ ...good, checksum: "0".repeat(64) });
        throw outdated(["PRINT_READY"]);
      });

      await act(() => view.result.current.run());

      expect(view.result.current.step).toBe("error");
      expect(autosave.conflict).toHaveBeenCalledTimes(1);
      expect(renderer.preview).toHaveBeenCalledTimes(1); // not drawn again
      expect(uploadDesignFiles).not.toHaveBeenCalled();
    });

    it("repairs every file when the BE names no role it knows", async () => {
      const { view } = await setup();
      submitDesign.mockRejectedValueOnce(outdated(["SOMETHING_NEW"]));
      readDesignVersion.mockResolvedValue(8);
      requestReview.mockResolvedValue(pending);

      await act(() => view.result.current.run());

      expect(uploadDesignFiles.mock.calls[0]![4]).toEqual([
        "CUSTOMER_PREVIEW",
        "PRINT_READY",
        "TECHNICAL_SPEC",
      ]);
    });
  });

  describe("a 409 DESIGN_FILES_OUTDATED after the template changed on the server", () => {
    const outdated = new ApiError(409, "DESIGN_FILES_OUTDATED", "outdated", undefined, undefined, {
      roles: ["PRINT_READY"],
    });
    const changedTemplate = (services: StudioServices) =>
      ({
        ...services.printConfig,
        template: { ...services.printConfig.template, minDpi: 600 },
      }) as Awaited<ReturnType<typeof api.getDesignPrintConfig>>;

    it("stops with the findings of the check on the new template, and Thử lại never resends the stale files", async () => {
      const { view, services, renderer } = await setup();
      submitDesign.mockRejectedValueOnce(outdated);
      getDesignPrintConfig.mockResolvedValue(changedTemplate(services));
      const findings = [{ ruleId: "DPI_BELOW_MIN", level: "fail", message: "Ảnh dưới 600 DPI." }];
      drawDesign.mockResolvedValue({
        failed: { result: "Fail", issues: findings },
      } as Awaited<ReturnType<typeof steps.drawDesign>>);

      await act(() => view.result.current.run());

      expect(view.result.current.step).toBe("error");
      expect(view.result.current.issues).toEqual(findings);
      expect(uploadDesignFiles).not.toHaveBeenCalled(); // nothing of the old template is resent
      const first = submitDesign.mock.calls[0]![1].files;

      // "Thử lại" checks the design again and draws anew: it does not resume with the stale bundle.
      submitDesign.mockResolvedValueOnce(pending);
      await act(() => view.result.current.retry());

      expect(renderer.preview).toHaveBeenCalledTimes(2);
      expect(submitDesign.mock.calls[1]![1].files).not.toBe(first);
      expect(submitDesign.mock.calls[1]![1].runNonce).not.toBe(
        submitDesign.mock.calls[0]![1].runNonce,
      );
    });

    it("draws on the new template and uploads those files under a new nonce when it still passes", async () => {
      const { view, services } = await setup();
      submitDesign.mockRejectedValueOnce(outdated);
      getDesignPrintConfig.mockResolvedValue(changedTemplate(services));
      // Drawn on the new template by a session of its own: a bundle other than the first.
      drawDesign.mockImplementation(
        async () =>
          ({
            drawn: {
              bundle: { ...submitDesign.mock.calls[0]![1].files },
              checksum: "x",
              report: { result: "Pass", issues: [] },
              runNonce: "unused",
            },
          }) as unknown as Awaited<ReturnType<typeof steps.drawDesign>>,
      );
      readDesignVersion.mockResolvedValue(8);
      requestReview.mockResolvedValue(designOf({ status: "PENDING_REVIEW", version: 9 }));

      await act(() => view.result.current.run());

      expect(view.result.current.step).toBe("done");
      const [, files, , runNonce, roles] = uploadDesignFiles.mock.calls[0]!;
      expect(files).not.toBe(submitDesign.mock.calls[0]![1].files);
      expect(files).toEqual(submitDesign.mock.calls[0]![1].files);
      expect(roles).toEqual(["PRINT_READY"]);
      expect(runNonce).not.toBe(submitDesign.mock.calls[0]![1].runNonce);
    });
  });

  describe("an answer to the request for review lost on the way (Flows M-1)", () => {
    const lost = () => new ApiError(0, "NETWORK_ERROR", "Không kết nối được máy chủ.");

    it("reads the design again and shows the run done when it is now in review", async () => {
      const { view, client, autosave, services } = await setup();
      submitDesign.mockRejectedValue(lost()); // the BE took it, the answer never came
      getDesign.mockResolvedValue(pending);

      await act(() => view.result.current.run());

      expect(view.result.current.step).toBe("done");
      expect(view.result.current.error).toBeUndefined();
      expect(getDesign).toHaveBeenCalledWith(draft.id);
      expect(autosave.setVersion).toHaveBeenCalledWith(pending.version);
      expect(services.ownStatusMove).toHaveBeenCalledWith("PENDING_REVIEW");
      expect(client.getQueryData<Design>(designKeys.detail(draft.id))?.status).toBe(
        "PENDING_REVIEW",
      );
      expect(submitDesign).toHaveBeenCalledTimes(1);
    });

    it("finds the design in review behind the 409 DESIGN_NOT_DRAFT of a retry", async () => {
      const { view } = await setup();
      submitDesign.mockRejectedValue(new ApiError(409, "DESIGN_NOT_DRAFT", "not a draft"));
      getDesign.mockResolvedValue(pending);

      await act(() => view.result.current.run());

      expect(view.result.current.step).toBe("done");
    });

    it("finds it after the repair of outdated files too", async () => {
      const { view } = await setup();
      submitDesign.mockRejectedValueOnce(
        new ApiError(409, "DESIGN_FILES_OUTDATED", "outdated", undefined, undefined, {
          roles: ["PRINT_READY"],
        }),
      );
      readDesignVersion.mockResolvedValue(8);
      requestReview.mockRejectedValue(lost());
      getDesign.mockResolvedValue(pending);

      await act(() => view.result.current.run());

      expect(view.result.current.step).toBe("done");
      expect(requestReview).toHaveBeenCalledTimes(1);
    });

    it("stays a failure when the design is still a draft, or cannot be read", async () => {
      const { view } = await setup();
      const error = lost();
      submitDesign.mockRejectedValue(error);
      getDesign.mockResolvedValueOnce(draft);

      await act(() => view.result.current.run());
      expect(view.result.current.step).toBe("error");
      expect(view.result.current.error).toBe(error);

      getDesign.mockRejectedValueOnce(lost());
      await act(() => view.result.current.retry());
      expect(view.result.current.step).toBe("error");
      expect(view.result.current.error).toBe(error);
    });

    it("does not read the design again for the BE's own refusal of the layout", async () => {
      const { view } = await setup();
      submitDesign.mockRejectedValue(
        new ApiError(422, "DESIGN_PREFLIGHT_FAILED", "failed", undefined, undefined, {
          issues: [{ rule: "EMPTY_DESIGN" }],
        }),
      );

      await act(() => view.result.current.run());

      expect(view.result.current.step).toBe("error");
      expect(getDesign).not.toHaveBeenCalled();
    });
  });

  it("re-reads the design and does not loop on a 409 CONFLICT", async () => {
    const { view, client } = await setup();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const conflict = new ApiError(409, "CONFLICT", "stale");
    submitDesign.mockRejectedValue(conflict);

    await act(() => view.result.current.run());

    expect(view.result.current.step).toBe("error");
    expect(view.result.current.error).toBe(conflict);
    expect(submitDesign).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: designKeys.detail(draft.id), exact: true });
  });

  it("retries an upload failure with the rendered bundle, without rendering again", async () => {
    const { view, renderer, autosave } = await setup();
    submitDesign.mockRejectedValueOnce(new ApiError(503, "UNAVAILABLE", "down"));
    submitDesign.mockResolvedValueOnce(pending);

    await act(() => view.result.current.run());
    expect(view.result.current.step).toBe("error");
    expect(view.result.current.issues).toBeNull();
    const rendered = renderer.printSurface.mock.calls.length;

    await act(() => view.result.current.retry());

    await waitFor(() => expect(view.result.current.step).toBe("done"));
    expect(renderer.printSurface).toHaveBeenCalledTimes(rendered);
    expect(renderer.preview).toHaveBeenCalledTimes(1);
    expect(submitDesign).toHaveBeenCalledTimes(2);
    expect(submitDesign.mock.calls[1]![1].files).toBe(submitDesign.mock.calls[0]![1].files);
    // The same upload of the same run: the retry sends the same keys, so it replays.
    expect(submitDesign.mock.calls[1]![1].runNonce).toBe(submitDesign.mock.calls[0]![1].runNonce);
    expect(autosave.flush).toHaveBeenCalledTimes(1);
  });

  it("submits nothing when the stored document changes while it is rendered, and draws anew after", async () => {
    const { view, autosave, renderer } = await setup();
    const good = await getDesignDocument(draft.id);
    renderer.printSurface.mockImplementationOnce(async () => {
      getDesignDocument.mockResolvedValue({ ...good, checksum: "0".repeat(64) });
      return [{ png: PNG_1x1, heightPx: 1 }];
    });

    await act(() => view.result.current.run());

    expect(view.result.current.step).toBe("error");
    expect(autosave.conflict).toHaveBeenCalledTimes(1);
    expect(submitDesign).not.toHaveBeenCalled();

    getDesignDocument.mockResolvedValue(good);
    submitDesign.mockResolvedValue(pending);
    await act(() => view.result.current.retry());

    expect(renderer.preview).toHaveBeenCalledTimes(2);
    expect(view.result.current.step).toBe("done");
  });

  it("binds the files to the checksum of the document record it verified, whatever version the design reads", async () => {
    const { view } = await setup();
    submitDesign.mockResolvedValue(pending);
    getDesign.mockResolvedValue({ ...draft, version: 99 });

    await act(() => view.result.current.run());

    const record = await getDesignDocument(draft.id);
    expect(submitDesign.mock.calls[0]![1].documentChecksum).toBe(record.checksum);
  });

  it("stays done, and never submits twice, when the re-read after a successful submit fails", async () => {
    const { view, client, autosave } = await setup();
    submitDesign.mockResolvedValue(pending);
    vi.spyOn(client, "invalidateQueries").mockRejectedValue(new Error("offline"));

    await act(() => view.result.current.run());
    await act(() => view.result.current.retry());

    expect(view.result.current.step).toBe("done");
    expect(view.result.current.error).toBeUndefined();
    expect(autosave.setVersion).toHaveBeenCalledWith(4);
    expect(submitDesign).toHaveBeenCalledTimes(1);
  });

  it("submits a design that came back as a draft with a new run, and never on retry", async () => {
    const { view } = await setup();
    submitDesign.mockResolvedValueOnce(pending);
    await act(() => view.result.current.run());
    expect(view.result.current.step).toBe("done");

    // The reviewer returned it: a draft again, one version on (the document record follows).
    const record = await getDesignDocument(draft.id);
    getDesignDocument.mockResolvedValue({ ...record, version: 5 });
    submitDesign.mockResolvedValueOnce(designOf({ status: "PENDING_REVIEW", version: 6 }));
    await act(() => view.result.current.run());

    expect(view.result.current.step).toBe("done");
    expect(submitDesign).toHaveBeenCalledTimes(2);
    expect(submitDesign.mock.calls[1]![1].documentChecksum).toBe(record.checksum);
    // A new run with the same layout and bytes: another nonce, so another key.
    expect(submitDesign.mock.calls[1]![1].runNonce).not.toBe(
      submitDesign.mock.calls[0]![1].runNonce,
    );

    await act(() => view.result.current.retry());
    expect(submitDesign).toHaveBeenCalledTimes(2);
  });
});
