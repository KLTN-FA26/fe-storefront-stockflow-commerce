import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AccountSidebar, scrollToReveal } from "../account-sidebar";

vi.mock("next/navigation", () => ({
  usePathname: () => "/account/orders",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

/** An element whose box is [left, right] on screen. */
function boxed(left: number, right: number): HTMLElement {
  const element = document.createElement("div");
  element.getBoundingClientRect = () =>
    ({ left, right, width: right - left, top: 0, bottom: 44, height: 44 }) as DOMRect;
  return element;
}

describe("scrollToReveal (account tab strip, sf-10)", () => {
  const strip = boxed(0, 375);

  it("leaves the strip at its start when the active tab is already in view", () => {
    expect(scrollToReveal(strip, boxed(250, 350))).toBe(0);
  });

  it("scrolls just enough to bring a tab past the right edge into view", () => {
    expect(scrollToReveal(strip, boxed(400, 500))).toBe(141);
  });

  it("scrolls back for a tab cut off at the left edge", () => {
    expect(scrollToReveal(strip, boxed(-40, 60))).toBe(-56);
  });
});

describe("AccountSidebar", () => {
  it("offers the chat as a tab on a phone, where the floating button is hidden", () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <AccountSidebar />
      </QueryClientProvider>,
    );
    const strips = screen.getAllByRole("navigation", { name: "Tài khoản" });
    // The phone strip comes first, the desktop rail after it.
    expect(within(strips[0]!).getByRole("link", { name: "Chat với Sale" })).toHaveAttribute(
      "href",
      "/chat",
    );
  });
});
