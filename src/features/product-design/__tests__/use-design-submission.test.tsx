import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/error";

import * as api from "../api";
import type { AutosaveState } from "../autosave";
import type { ExportRenderer } from "../components/studio/export-renderer";
import { StudioProvider, type StudioServices } from "../components/studio/studio-context";
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
import { design as designOf, documentRecordDto } from "./fixtures";

vi.mock("../api", () => ({
  getDesign: vi.fn(),
  getDesignDocument: vi.fn(),
  submitDesign: vi.fn(),
  recordPreflightFailure: vi.fn(),
}));
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
 * (`as unknown as`): the old `StudioServices` type still names removed types until Task 9.
 */
async function setup(opts: { filled?: boolean; autosaveState?: AutosaveState } = {}) {
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
  } as unknown as StudioServices;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <StudioProvider value={services}>{children}</StudioProvider>
    </QueryClientProvider>
  );
  const view = renderHook(() => useDesignSubmission(draft), { wrapper });
  return { view, client, autosave, renderer, calls };
}

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

  it("flushes autosave, submits the version read after it with the three files, and holds the pending design", async () => {
    const { view, client, autosave, calls } = await setup();
    submitDesign.mockImplementation(async () => {
      calls.push("submit");
      return pending;
    });

    await act(() => view.result.current.run());

    expect(view.result.current.step).toBe("done");
    expect(view.result.current.issues).toBeNull();
    expect(calls).toEqual(["flush", "submit"]);
    const [id, input] = submitDesign.mock.calls[0]!;
    expect(id).toBe(draft.id);
    expect(input.version).toBe(3);
    expect(input.preflight.result).toBe("Pass");
    expect(Object.keys(input.files).toSorted()).toEqual([
      "CUSTOMER_PREVIEW",
      "PRINT_READY",
      "TECHNICAL_SPEC",
    ]);
    expect(recordPreflightFailure).not.toHaveBeenCalled();
    expect(autosave.setVersion).toHaveBeenCalledWith(4);
    expect(client.getQueryData<Design>(designKeys.detail(draft.id))?.status).toBe("PENDING_REVIEW");
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
    await act(() => view.result.current.run());

    expect(view.result.current.step).toBe("done");
    expect(view.result.current.error).toBeUndefined();
    expect(autosave.setVersion).toHaveBeenCalledWith(4);
    expect(submitDesign).toHaveBeenCalledTimes(1);
  });
});
