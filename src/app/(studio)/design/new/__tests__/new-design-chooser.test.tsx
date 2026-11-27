import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders, signIn, signOut } from "@/test/render";

import { NewDesignChooser } from "../new-design-chooser";

const env = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: env.push, replace: vi.fn() }) }));

beforeEach(() => {
  env.push.mockReset();
  signIn();
});
afterEach(() => {
  vi.restoreAllMocks();
  signOut();
});

describe("/design/new without a product or SKU (S08-11)", () => {
  it("opens the 'Thiết kế mới' dialog at once, and leaves a way back to it when it is closed", async () => {
    const user = userEvent.setup();
    renderWithProviders(<NewDesignChooser />);

    const dialog = await screen.findByRole("dialog", { name: "Thiết kế mới" });
    await user.click(within(dialog).getByRole("button", { name: "Huỷ" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("Chưa chọn quy cách để thiết kế")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Xem sản phẩm" })).toHaveAttribute("href", "/catalog");

    await user.click(screen.getByRole("button", { name: "Chọn sản phẩm" }));
    expect(await screen.findByRole("dialog", { name: "Thiết kế mới" })).toBeInTheDocument();
  });

  it("says the new design joins the project the link names", async () => {
    renderWithProviders(<NewDesignChooser projectId="p-1" />);

    const dialog = await screen.findByRole("dialog", { name: "Thiết kế mới" });
    expect(within(dialog).getByText(/Bản mới sẽ nằm trong dự án này/)).toBeInTheDocument();
  });
});
