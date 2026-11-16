import { createEvent, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ImageDropzone } from "../components/image-dropzone";

const box = () => screen.getByText("Kéo thả hoặc chọn ảnh").parentElement as HTMLElement;
const file = new File(["x"], "a.png", { type: "image/png" });
const withFiles = { types: ["Files"], files: [file] };

describe("ImageDropzone", () => {
  it("passes a dropped file on", () => {
    const onFile = vi.fn();
    render(<ImageDropzone accept="image/png" hint="PNG" disabled={false} onFile={onFile} />);
    fireEvent.drop(box(), { dataTransfer: withFiles });
    expect(onFile).toHaveBeenCalledWith(file);
  });

  it("still swallows a dropped file while shut, so the browser does not open it", () => {
    const onFile = vi.fn();
    render(<ImageDropzone accept="image/png" hint="PNG" disabled onFile={onFile} />);
    const over = createEvent.dragOver(box(), { dataTransfer: withFiles });
    fireEvent(box(), over);
    expect(over.defaultPrevented).toBe(true);
    const drop = createEvent.drop(box(), { dataTransfer: withFiles });
    fireEvent(box(), drop);
    expect(drop.defaultPrevented).toBe(true);
    expect(onFile).not.toHaveBeenCalled();
  });
});
