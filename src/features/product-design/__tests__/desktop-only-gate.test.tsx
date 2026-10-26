import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DesktopOnlyGate } from "../components/desktop-only-gate";

const NOTICE = "Chức năng thiết kế chỉ hỗ trợ trên máy tính";

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, "userAgent");
  Reflect.deleteProperty(navigator, "maxTouchPoints");
});

/**
 * Answers `window.matchMedia` as a window `width` px wide would (jsdom has none), on a touch
 * screen with no hover when `touch`, and tells the listeners when `resize` changes the width.
 */
function stubWidth(initial: number, { touch = false } = {}) {
  let width = initial;
  const listeners = new Set<() => void>();
  vi.stubGlobal("matchMedia", (query: string) => {
    const range = /^\(max-width:\s*([\d.]+)rem\)$/.exec(query);
    return {
      matches: range
        ? width <= Number(range[1]) * 16
        : query === "(pointer: coarse) and (hover: none)" && touch,
      media: query,
      addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
    };
  });
  return {
    resize(next: number) {
      width = next;
      act(() => listeners.forEach((listener) => listener()));
    },
  };
}

/** The browser's own word on what it runs on (jsdom says neither). */
function stubBrowser(userAgent: string, maxTouchPoints = 0) {
  Object.defineProperty(navigator, "userAgent", { value: userAgent, configurable: true });
  Object.defineProperty(navigator, "maxTouchPoints", { value: maxTouchPoints, configurable: true });
}

const IPAD_SAFARI =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const ANDROID_TABLET =
  "Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";

/** Stands in for the studio: an edit kept in its own state. */
function Studio() {
  const [name, setName] = useState("");
  return (
    <label>
      Tên thiết kế
      <input value={name} onChange={(event) => setName(event.target.value)} />
    </label>
  );
}

describe("DesktopOnlyGate", () => {
  it("tells a phone the studio needs a computer and does not open it", () => {
    stubWidth(375);
    render(
      <DesktopOnlyGate>
        <Studio />
      </DesktopOnlyGate>,
    );

    expect(screen.getByRole("heading", { name: NOTICE })).toBeInTheDocument();
    expect(screen.queryByLabelText("Tên thiết kế")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Thiết kế của tôi" })).toHaveAttribute(
      "href",
      "/design",
    );
  });

  it("turns a 1023 px window away and opens the studio at 1024 px", () => {
    const window = stubWidth(1023);
    render(
      <DesktopOnlyGate>
        <Studio />
      </DesktopOnlyGate>,
    );
    expect(screen.getByRole("heading", { name: NOTICE })).toBeInTheDocument();

    window.resize(1024);
    expect(screen.queryByRole("heading", { name: NOTICE })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Tên thiết kế")).toBeVisible();
  });

  it("turns a tablet away at any width: a touch screen with no hover", () => {
    stubWidth(1366, { touch: true });
    render(
      <DesktopOnlyGate>
        <Studio />
      </DesktopOnlyGate>,
    );

    expect(screen.getByRole("heading", { name: NOTICE })).toBeInTheDocument();
    expect(screen.queryByLabelText("Tên thiết kế")).not.toBeInTheDocument();
  });

  it("turns an iPad away though its Safari says Macintosh, and lets a Mac in", () => {
    stubWidth(1366);
    stubBrowser(IPAD_SAFARI, 5);
    const { unmount } = render(
      <DesktopOnlyGate>
        <Studio />
      </DesktopOnlyGate>,
    );
    expect(screen.getByRole("heading", { name: NOTICE })).toBeInTheDocument();
    unmount();

    stubBrowser(IPAD_SAFARI, 0);
    render(
      <DesktopOnlyGate>
        <Studio />
      </DesktopOnlyGate>,
    );
    expect(screen.getByLabelText("Tên thiết kế")).toBeVisible();
  });

  it("turns an Android tablet away by its browser", () => {
    stubWidth(1280);
    stubBrowser(ANDROID_TABLET, 10);
    render(
      <DesktopOnlyGate>
        <Studio />
      </DesktopOnlyGate>,
    );

    expect(screen.getByRole("heading", { name: NOTICE })).toBeInTheDocument();
  });

  it("opens the studio on a desktop, and where the width cannot be read", () => {
    stubWidth(1280);
    const { unmount } = render(
      <DesktopOnlyGate>
        <Studio />
      </DesktopOnlyGate>,
    );
    expect(screen.getByLabelText("Tên thiết kế")).toBeVisible();
    expect(screen.queryByRole("heading", { name: NOTICE })).not.toBeInTheDocument();
    unmount();

    vi.unstubAllGlobals();
    render(
      <DesktopOnlyGate>
        <Studio />
      </DesktopOnlyGate>,
    );
    expect(screen.getByLabelText("Tên thiết kế")).toBeVisible();
  });

  it("keeps an open studio's edits, hidden, while the window is too narrow", async () => {
    const user = userEvent.setup();
    const window = stubWidth(1280);
    render(
      <DesktopOnlyGate>
        <Studio />
      </DesktopOnlyGate>,
    );
    await user.type(screen.getByLabelText("Tên thiết kế"), "Ly Tết");

    window.resize(800);
    expect(screen.getByRole("heading", { name: NOTICE })).toBeInTheDocument();
    expect(screen.getByLabelText("Tên thiết kế")).not.toBeVisible();

    window.resize(1440);
    expect(screen.queryByRole("heading", { name: NOTICE })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Tên thiết kế")).toBeVisible();
    expect(screen.getByLabelText("Tên thiết kế")).toHaveValue("Ly Tết");
  });

  it("copies the page link to open it on a computer", async () => {
    const user = userEvent.setup();
    stubWidth(375);
    render(
      <DesktopOnlyGate>
        <Studio />
      </DesktopOnlyGate>,
    );

    await user.click(screen.getByRole("button", { name: "Sao chép liên kết" }));

    expect(await navigator.clipboard.readText()).toBe(window.location.href);
    expect(screen.getByRole("button", { name: "Đã sao chép liên kết" })).toBeInTheDocument();
  });

  it("says how to copy the link by hand when the clipboard is blocked", async () => {
    const user = userEvent.setup();
    stubWidth(375);
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("blocked"));
    render(
      <DesktopOnlyGate>
        <Studio />
      </DesktopOnlyGate>,
    );

    await user.click(screen.getByRole("button", { name: "Sao chép liên kết" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Không sao chép được. Hãy sao chép địa chỉ trên trình duyệt.",
    );
  });

  it("server-renders the notice for narrow screens only, and not the studio", () => {
    const html = renderToString(
      <DesktopOnlyGate>
        <Studio />
      </DesktopOnlyGate>,
    );

    expect(html).toContain(NOTICE);
    expect(html).toMatch(/<main class="[^"]*\blg:hidden\b/);
    expect(html).not.toContain("Tên thiết kế");
  });
});
