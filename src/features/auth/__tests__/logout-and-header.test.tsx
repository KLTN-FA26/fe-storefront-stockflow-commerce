import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api/client";
import { useAuthStore } from "@/lib/auth/auth-store";
import { useCartStore } from "@/lib/store/use-cart-store";
import { resetCart, signIn, signOut } from "@/test/render";

import { HeaderAccountLink } from "../components/header-account-link";
import { LogoutButton } from "../components/logout-button";

const replace = vi.fn();

beforeEach(() => {
  replace.mockReset();
  vi.spyOn(window, "location", "get").mockReturnValue({ replace } as unknown as Location);
  vi.spyOn(api, "post").mockResolvedValue({ data: undefined });
  resetCart();
});
afterEach(() => {
  vi.restoreAllMocks();
  signOut();
  resetCart();
});

describe("LogoutButton", () => {
  it("ends the session, empties the cart and loads the login page afresh", async () => {
    signIn();
    useCartStore.setState({
      ownerId: "c",
      lines: [{ sku: "A", slug: "a", title: "A", quantity: 1 }],
    });
    render(<LogoutButton />);

    await userEvent.click(screen.getByRole("button", { name: "Đăng xuất" }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
    expect(api.post).toHaveBeenCalledWith("/identity/auth/logout");
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useCartStore.getState().lines).toEqual([]);
  });
});

describe("HeaderAccountLink", () => {
  it("is the account when signed in and the login page when not", async () => {
    signIn();
    const { rerender } = render(<HeaderAccountLink className="x" />);
    expect(screen.getByRole("link", { name: /Tài khoản/ })).toHaveAttribute("href", "/account");

    signOut();
    rerender(<HeaderAccountLink className="x" />);
    expect(await screen.findByRole("link", { name: /Đăng nhập/ })).toHaveAttribute(
      "href",
      "/login",
    );
  });
});
