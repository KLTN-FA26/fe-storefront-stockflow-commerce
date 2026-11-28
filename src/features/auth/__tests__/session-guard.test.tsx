import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { signOut } from "@/test/render";

import { SessionGuard } from "../components/session-guard";

const navigation = vi.hoisted(() => ({ pathname: "/", replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ replace: navigation.replace }),
}));

afterEach(() => {
  navigation.replace.mockReset();
  signOut();
});

describe("SessionGuard", () => {
  it.each(["/", "/mo-tai-khoan", "/xac-minh-hop-dong/public-code"])(
    "lets a visitor see %s without signing in",
    (pathname) => {
      signOut();
      navigation.pathname = pathname;
      render(
        <SessionGuard>
          <p>Trang công khai</p>
        </SessionGuard>,
      );
      expect(screen.getByText("Trang công khai")).toBeInTheDocument();
      expect(navigation.replace).not.toHaveBeenCalled();
    },
  );

  it("sends a visitor of a customer page to the login page", async () => {
    signOut();
    navigation.pathname = "/catalog";
    window.history.replaceState(null, "", "/catalog");
    render(
      <SessionGuard>
        <p>Sản phẩm</p>
      </SessionGuard>,
    );
    expect(screen.queryByText("Sản phẩm")).not.toBeInTheDocument();
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/login?next=%2Fcatalog"));
    window.history.replaceState(null, "", "/");
  });
});
