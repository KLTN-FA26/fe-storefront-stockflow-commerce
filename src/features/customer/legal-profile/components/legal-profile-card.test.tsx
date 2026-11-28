import { screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/error";
import { renderWithProviders, signIn, signOut } from "@/test/render";

import { LegalProfileCard } from "./legal-profile-card";

beforeEach(() => signIn());
afterEach(() => {
  vi.restoreAllMocks();
  signOut();
});

describe("LegalProfileCard (SF-UX-40)", () => {
  it("shows the legal identity read only, and a way to ask Sale for a change", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValue({
      data: {
        legalName: "Công ty TNHH Nhà Mình",
        taxCode: "0399990001",
        registeredAddress: "12 Nguyễn Huệ, Phường Bến Nghé, TP. Hồ Chí Minh",
        representativeName: "Nguyễn Thị Khách",
        representativeTitle: "Giám đốc",
        invoiceEmail: "hoadon@nhaminh.vn",
        bankAccountNumber: null,
      },
    });
    renderWithProviders(<LegalProfileCard />);

    const card = await screen.findByRole("region", { name: "Thông tin pháp lý" });
    expect(get).toHaveBeenCalledWith("/customers/me/legal-profile", expect.anything());
    expect(screen.getByText("Mã số thuế").nextElementSibling).toHaveTextContent("0399990001");
    expect(screen.getByText("Email nhận hoá đơn")).toBeInTheDocument();
    // A field the BE left empty is not shown as a blank row.
    expect(screen.queryByText("Số tài khoản")).not.toBeInTheDocument();
    expect(card.querySelector("input")).toBeNull();
    expect(screen.getByRole("link", { name: "Báo Sale nếu cần sửa" })).toHaveAttribute(
      "href",
      "/chat/new",
    );
  });

  it.each([
    ["no profile yet (data: null)", () => Promise.resolve({ data: null })],
    ["404", () => Promise.reject(new ApiError(404, "NOT_FOUND", "none"))],
    [
      "an older BE (400 on 'me')",
      () => Promise.reject(new ApiError(400, "UNSUPPORTED_PARAMETER", "bad")),
    ],
  ])("is left out for %s", async (_case, answer) => {
    const get = vi.spyOn(api, "get").mockImplementation(answer as () => Promise<never>);
    const { container } = renderWithProviders(<LegalProfileCard />);
    await waitFor(() => expect(get).toHaveBeenCalled());
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});
