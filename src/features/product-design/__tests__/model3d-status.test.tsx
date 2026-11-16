import { render, renderHook, screen, act } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  Model3dStatusLine,
  MODEL3D_MESSAGES,
  useModel3dStatus,
} from "../components/studio/model3d-status";
import { createEditor, emptyDocument, type Model3dRef } from "../engine";
import { cup12oz } from "../engine/__tests__/fixtures";

const editorOf = () => createEditor({ template: cup12oz, document: emptyDocument(cup12oz) });
const fileOf = (url: string): Model3dRef => ({
  url,
  surfaces: [{ printAreaCode: "BODY", meshName: "print:BODY" }],
});

describe("useModel3dStatus", () => {
  it("says nothing until a status is reported, then follows it", () => {
    const editor = editorOf();
    const model3d = fileOf("/a.glb");
    const { result } = renderHook(() => useModel3dStatus(editor, model3d));
    expect(result.current.message).toBeNull();

    act(() => result.current.report("loading"));
    expect(result.current.message).toBe(MODEL3D_MESSAGES.loading);
    act(() => result.current.report("failed"));
    expect(result.current.message).toBe(MODEL3D_MESSAGES.failed);
    act(() => result.current.report("ready"));
    expect(result.current.message).toBeNull();
  });

  it("drops a failure when the file goes away under the same, mounted viewer", () => {
    const editor = editorOf();
    const model3d = fileOf("/a.glb");
    const { result, rerender } = renderHook(
      ({ file }: { file: Model3dRef | null }) => useModel3dStatus(editor, file),
      { initialProps: { file: model3d as Model3dRef | null } },
    );
    act(() => result.current.report("failed"));
    expect(result.current.message).toBe(MODEL3D_MESSAGES.failed);

    rerender({ file: null }); // no file to load, so the viewer sends no event
    expect(result.current.message).toBeNull();
  });

  it("drops a status reported for another file or another editor", () => {
    const editor = editorOf();
    const { result, rerender } = renderHook(
      ({ ed, file }: { ed: ReturnType<typeof editorOf>; file: Model3dRef }) =>
        useModel3dStatus(ed, file),
      { initialProps: { ed: editor, file: fileOf("/a.glb") } },
    );
    act(() => result.current.report("loading"));

    rerender({ ed: editor, file: fileOf("/b.glb") });
    expect(result.current.message).toBeNull();

    act(() => result.current.report("failed"));
    rerender({ ed: editorOf(), file: fileOf("/b.glb") });
    expect(result.current.message).toBeNull();
  });
});

describe("Model3dStatusLine", () => {
  it("keeps one live region in place and fills it, so the text is announced", () => {
    const { rerender } = render(<Model3dStatusLine message={null} />);
    const region = screen.getByRole("status");
    expect(region).toBeEmptyDOMElement();

    rerender(<Model3dStatusLine message={MODEL3D_MESSAGES.loading} />);
    expect(screen.getByRole("status")).toBe(region); // the same node
    expect(region).toHaveTextContent(MODEL3D_MESSAGES.loading);

    rerender(<Model3dStatusLine message={null} />);
    expect(region).toBeEmptyDOMElement();
  });
});
