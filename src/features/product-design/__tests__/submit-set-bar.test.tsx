import { render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SubmitSetBar } from "../components/submit-set-bar";

const NOTE = "Gửi duyệt trên máy tính (màn hình từ 1024 px)";
const bar = <SubmitSetBar projectId="p-1" chosen={["a", "b"]} gate={{ allowed: true }} />;
const IPAD = "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("SubmitSetBar: no submit on a phone or tablet", () => {
  it("is locked without the sentence in the server HTML, so nothing flashes on a computer", () => {
    // Server render: the device is not known yet (`useDeviceFit` is "unknown").
    const html = renderToString(bar);
    expect(html).not.toContain(NOTE);
    expect(html).not.toContain("href=");
    // The attribute itself, not the `disabled:` utility classes every button carries.
    expect(html).toMatch(/<button[^>]*\sdisabled=""/);
    // No reason and no device yet: nothing to describe it, so no dangling aria-describedby.
    expect(html).not.toContain("aria-describedby");
  });

  it("is a link to the submit page on a computer", () => {
    render(bar);
    expect(screen.getByRole("link", { name: "Gửi duyệt cả bộ" })).toHaveAttribute(
      "href",
      expect.stringContaining("/submit"),
    );
    expect(screen.queryByText(NOTE)).not.toBeInTheDocument();
  });

  it("is locked on a tablet, whatever its width, and says to use a computer", () => {
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue(IPAD);
    render(bar);
    expect(screen.queryByRole("link", { name: "Gửi duyệt cả bộ" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Gửi duyệt cả bộ" })).toBeDisabled();
    expect(screen.getByText(NOTE)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Gửi duyệt cả bộ" })).toHaveAccessibleDescription(
      NOTE,
    );
  });

  it("describes both the project's reason and the computer note on a tablet", () => {
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue(IPAD);
    render(
      <SubmitSetBar
        projectId="p-1"
        chosen={["a", "b"]}
        gate={{ allowed: false, reason: "Dự án đang chờ duyệt" }}
      />,
    );
    expect(screen.getByRole("button", { name: "Gửi duyệt cả bộ" })).toHaveAccessibleDescription(
      `Dự án đang chờ duyệt ${NOTE}`,
    );
  });

  it("is locked on a phone-width window", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: true,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    render(bar);
    expect(screen.getByRole("button", { name: "Gửi duyệt cả bộ" })).toBeDisabled();
    expect(screen.getByText(NOTE)).toBeInTheDocument();
  });
});
