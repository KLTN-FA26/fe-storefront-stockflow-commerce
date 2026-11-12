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
  type PreflightIssue,
} from "../engine";
import { cup12oz, PNG_1x1, sizer, textEl } from "../engine/__tests__/fixtures";
import { designKeys } from "../queries";
import type { Design } from "../types";
import { printConfigDtoSchema } from "../schemas";
import { design as designOf, documentRecordDto, printConfigDto } from "./fixtures";

vi.mock("../api", () => ({
  getDesign: vi.fn(),
  getDesignDocument: vi.fn(),
  submitDesign: vi.fn(),
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
const getDesign = vi.mocked(api.getDesign);
const getDesignDocument = vi.mocked(api.getDesignDocument);
const submitDesign = vi.mocked(api.submitDesign);
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
  specSheet: vi.fn<ExportRenderer["specSheet"]>(async () => PNG_1x1),
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
    assetStatus: {},
    fontStatus: {},
    autosave,
    exportRenderer: renderer,
    printConfig: printConfigDtoSchema.parse(printConfigDto(opts.printConfig)),
    ownStatusMove: vi.fn(),
  } as unknown as StudioServices;
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
    expect(input.version).toBe(4); // read after the flush, not the 2 it found before
    expect(input.preflight.result).toBe("Pass");
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
    expect(submitDesign.mock.calls[0]![1].version).toBe(4);
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
    const issue: PreflightIssue = {
      ruleId: "OUTSIDE_PRINT_AREA",
      level: "fail",
      message: "Ra ngoài vùng in",
      surfaceCode: "BODY",
      elementId: "t",
    };
    submitDesign.mockRejectedValue(
      new ApiError(422, "PREFLIGHT_FAILED", "failed", undefined, undefined, { issues: [issue] }),
    );

    await act(() => view.result.current.run());

    expect(view.result.current.step).toBe("error");
    expect(view.result.current.issues).toEqual([issue]);
  });

  it("shows a server issue of a rule the engine does not know", async () => {
    const { view } = await setup();
    const added = { ruleId: "BLEED_MISSING", level: "fail", message: "Thiếu phần tràn lề." };
    submitDesign.mockRejectedValue(
      new ApiError(422, "PREFLIGHT_FAILED", "failed", undefined, undefined, { issues: [added] }),
    );

    await act(() => view.result.current.run());

    expect(view.result.current.issues).toEqual([added]);
  });

  it("draws anew on Thử lại after any 422 PREFLIGHT_FAILED, even one whose issues it cannot read", async () => {
    const { view, renderer } = await setup();
    submitDesign.mockRejectedValueOnce(
      new ApiError(422, "PREFLIGHT_FAILED", "failed", undefined, undefined, { issues: "x" }),
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

  it("re-reads the design and does not loop on a 409 VERSION_CONFLICT", async () => {
    const { view, client } = await setup();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const conflict = new ApiError(409, "VERSION_CONFLICT", "stale");
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

  it("sends the version of the document record it verified", async () => {
    const { view } = await setup();
    submitDesign.mockResolvedValue(pending);
    getDesign.mockResolvedValue({ ...draft, version: 99 });

    await act(() => view.result.current.run());

    expect(submitDesign.mock.calls[0]![1].version).toBe(3);
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
    expect(submitDesign.mock.calls[1]![1].version).toBe(5);

    await act(() => view.result.current.retry());
    expect(submitDesign).toHaveBeenCalledTimes(2);
  });
});
