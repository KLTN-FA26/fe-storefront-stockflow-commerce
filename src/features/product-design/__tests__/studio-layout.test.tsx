import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import StudioLayout from "@/app/(studio)/layout";
import { renderWithProviders, signIn, signOut } from "@/test/render";

import { designBackend } from "./design-backend";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/design/new",
  useParams: () => ({}),
}));
// The design API is on the mock (the server flag, threaded by context).
vi.mock("@/providers/app-providers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/providers/app-providers")>();
  return { ...actual, useIsDesignMock: () => true };
});

const PANEL = { name: "Giả lập Quản lý kinh doanh" } as const;
const NOTICE = "Chức năng thiết kế chỉ hỗ trợ trên máy tính";

beforeEach(() => signIn());
afterEach(() => {
  vi.unstubAllGlobals();
  signOut();
});

/** Answers `window.matchMedia` as a window `width` px wide would (jsdom has none). */
function stubWidth(width: number) {
  vi.stubGlobal("matchMedia", (query: string) => {
    const range = /^\(max-width:\s*([\d.]+)rem\)$/.exec(query);
    return {
      matches: range ? width <= Number(range[1]) * 16 : false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    };
  });
}

describe("StudioLayout simulation panel", () => {
  it("is absent on the desktop-only notice of a narrow window", async () => {
    await designBackend();
    stubWidth(375);
    renderWithProviders(
      <StudioLayout>
        <p>Studio</p>
      </StudioLayout>,
    );

    expect(await screen.findByText(NOTICE)).toBeInTheDocument();
    expect(screen.queryByRole("button", PANEL)).not.toBeInTheDocument();
  });

  it("shows on a desktop window, as a compact Giả lập trigger", async () => {
    await designBackend();
    stubWidth(1440);
    renderWithProviders(
      <StudioLayout>
        <p>Studio</p>
      </StudioLayout>,
    );

    const trigger = await screen.findByRole("button", PANEL);
    expect(trigger).toHaveTextContent("Giả lập");
    expect(trigger).toHaveAttribute("title", PANEL.name);
    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();
  });
});
