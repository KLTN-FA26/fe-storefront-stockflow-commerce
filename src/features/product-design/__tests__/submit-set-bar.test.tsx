import { render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SubmitSetBar } from "../components/submit-set-bar";

const NOTE = "Cần máy tính để gửi duyệt cả bộ";
const bar = <SubmitSetBar projectId="p-1" chosen={["a", "b"]} gate={{ allowed: true }} />;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("SubmitSetBar: the sentence about the computer", () => {
  it("is not in the server-rendered HTML, so it does not flash up on a computer", () => {
    // Server render: the device is not known yet (`useDeviceFit` is "unknown").
    expect(renderToString(bar)).not.toContain(NOTE);
  });

  it("is not shown on a device the studio takes", () => {
    render(bar);
    expect(screen.queryByText(NOTE)).not.toBeInTheDocument();
  });

  it("is shown on a tablet, whatever its width", () => {
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue(
      "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
    );
    render(bar);
    expect(screen.getByText(NOTE)).toBeInTheDocument();
  });
});
