import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/error";
import { renderWithProviders, signOut } from "@/test/render";

import { OpenAccountScreen } from "../components/open-account-screen";
import { normalizeTaxCode } from "../schemas";

// The province list comes from a third-party service: here it cannot be loaded, so the field is typed (its fallback).
const provinces = vi.hoisted(() => ({
  state: {
    provinces: [] as { value: string; label: string }[],
    error: new Error("offline") as Error | null,
  },
}));
vi.mock("@/hooks/use-vietnam-addresses", () => ({
  useVietnamAddresses: () => ({
    provinces: provinces.state.provinces,
    wards: [],
    loading: false,
    error: provinces.state.error,
    retry: vi.fn(),
  }),
}));

const SENT = "Đã nhận yêu cầu, Sale sẽ liên hệ trong 1 ngày làm việc";

beforeEach(() => {
  signOut();
  provinces.state = { provinces: [], error: new Error("offline") };
});
afterEach(() => vi.restoreAllMocks());

async function fill(over: Partial<Record<string, string>> = {}) {
  const values = {
    "Tên công ty": "Công ty TNHH Cà Phê Sáng",
    "Mã số thuế": "0312345678",
    "Tỉnh/Thành phố": "TP. Hồ Chí Minh",
    "Họ và tên": "Nguyễn Văn An",
    "Số điện thoại": "0908 123 456",
    Email: "an@caphesang.vn",
    ...over,
  };
  for (const [label, value] of Object.entries(values)) {
    if (value) await userEvent.type(screen.getByLabelText(label), value);
  }
}

const consent = () => userEvent.click(screen.getByRole("checkbox", { name: /Nghị định 13\/2023/ }));
const send = () => userEvent.click(screen.getByRole("button", { name: "Gửi yêu cầu" }));

describe("normalizeTaxCode (KE-HOACH sales owner §10.7: MST 10 / 13 số)", () => {
  it.each([
    ["0312345678", "0312345678"],
    ["0312345678-001", "0312345678-001"],
    ["0312345678001", "0312345678-001"],
    [" 0312 345.678-001 ", "0312345678-001"],
  ])("accepts %s as %s", (raw, canonical) => expect(normalizeTaxCode(raw)).toBe(canonical));

  it.each([
    "031234567",
    "03123456789",
    "031234567800",
    "0312345678-01",
    "03123456AB",
    "0312345678-0012",
  ])("refuses %s", (raw) => expect(normalizeTaxCode(raw)).toBeNull());
});

describe("OpenAccountScreen — /mo-tai-khoan (KE-HOACH sales owner §10.3, §10.7)", () => {
  it("is for a visitor who is signed out, and says no account is opened on the spot", () => {
    renderWithProviders(<OpenAccountScreen />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Mở tài khoản doanh nghiệp" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Yêu cầu tư vấn/)).toBeInTheDocument();
    expect(screen.getByText(/email mời kích hoạt/)).toBeInTheDocument();
  });

  it("sends the lead with the tax code in its canonical form, then shows the success screen", async () => {
    const post = vi.spyOn(api, "post").mockResolvedValue({ data: { received: true } });
    renderWithProviders(<OpenAccountScreen />);
    await fill({ "Mã số thuế": "0312345678001" });
    await userEvent.type(screen.getByLabelText(/Chức vụ/), "Giám đốc");
    await userEvent.click(screen.getByRole("checkbox", { name: "Ly" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Tô" }));
    await userEvent.type(screen.getByLabelText(/Sản lượng dự kiến/), "20.000 ly");
    await consent();
    await send();

    expect(await screen.findByRole("heading", { name: SENT })).toBeInTheDocument();
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith("/public/leads", {
      companyName: "Công ty TNHH Cà Phê Sáng",
      taxCode: "0312345678-001",
      contactName: "Nguyễn Văn An",
      contactTitle: "Giám đốc",
      phone: "0908 123 456",
      email: "an@caphesang.vn",
      province: "TP. Hồ Chí Minh",
      interests: ["CUP", "BOWL"],
      monthlyVolume: "20.000 ly",
      consent: true,
    });
    // The honeypot is never part of the request.
    expect(post.mock.calls[0]?.[1]).not.toHaveProperty("website");
  });

  it("checks the tax code: 10 or 13 digits, 10-3 accepted (§10.7)", async () => {
    const post = vi.spyOn(api, "post");
    renderWithProviders(<OpenAccountScreen />);
    await fill({ "Mã số thuế": "031234567" });
    await consent();
    await send();
    expect(await screen.findByText(/Mã số thuế gồm 10 số, hoặc 13 số/)).toBeInTheDocument();
    expect(screen.getByLabelText("Mã số thuế")).toHaveAttribute("aria-invalid", "true");
    expect(post).not.toHaveBeenCalled();
  });

  it("checks the phone is a Vietnamese number", async () => {
    const post = vi.spyOn(api, "post");
    renderWithProviders(<OpenAccountScreen />);
    await fill({ "Số điện thoại": "12345" });
    await consent();
    await send();
    expect(await screen.findByText("Số điện thoại không hợp lệ")).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it("requires the consent to process personal data (Nghị định 13/2023)", async () => {
    const post = vi.spyOn(api, "post");
    renderWithProviders(<OpenAccountScreen />);
    await fill();
    await send();
    expect(await screen.findByText(/Vui lòng đồng ý/)).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it("asks for the required fields before calling the BE", async () => {
    const post = vi.spyOn(api, "post");
    renderWithProviders(<OpenAccountScreen />);
    await send();
    for (const message of [
      "Vui lòng nhập tên công ty",
      "Vui lòng nhập mã số thuế",
      "Vui lòng nhập tên người liên hệ",
      "Vui lòng nhập số điện thoại",
      "Vui lòng nhập email",
      "Vui lòng chọn tỉnh/thành phố",
    ]) {
      expect(await screen.findByText(message)).toBeInTheDocument();
    }
    expect(post).not.toHaveBeenCalled();
  });

  it("honeypot: a filled 'website' sends nothing and is told the same as a person", async () => {
    const post = vi.spyOn(api, "post");
    const { container } = renderWithProviders(<OpenAccountScreen />);
    const trap = container.querySelector<HTMLInputElement>('input[name="website"]');
    expect(trap).not.toBeNull();
    expect(trap).toHaveAttribute("tabindex", "-1");
    expect(trap?.closest("[aria-hidden='true']")).not.toBeNull();
    await fill();
    await userEvent.type(trap!, "https://spam.example");
    await consent();
    await send();

    expect(await screen.findByRole("heading", { name: SENT })).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it("on 429 asks the visitor to try again later, and keeps what they typed", async () => {
    vi.spyOn(api, "post").mockRejectedValue(new ApiError(429, "RATE_LIMITED", "Too many requests"));
    renderWithProviders(<OpenAccountScreen />);
    await fill();
    await consent();
    await send();
    expect(await screen.findByRole("alert")).toHaveTextContent("Vui lòng thử lại sau ít phút");
    expect(screen.getByRole("alert")).toHaveTextContent("gửi nhiều yêu cầu");
    expect(screen.getByLabelText("Tên công ty")).toHaveValue("Công ty TNHH Cà Phê Sáng");
    expect(screen.queryByRole("heading", { name: SENT })).not.toBeInTheDocument();
  });

  it.each([
    ["a 409", new ApiError(409, "CONFLICT", "Customer 0312345678 already exists")],
    ["a 500", new ApiError(500, "INTERNAL_ERROR", "boom")],
  ])("on %s shows a generic retry message, never the BE's words", async (_case, error) => {
    vi.spyOn(api, "post").mockRejectedValue(error);
    renderWithProviders(<OpenAccountScreen />);
    await fill();
    await consent();
    await send();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Chưa gửi được yêu cầu. Vui lòng thử lại sau ít phút.");
    expect(alert).not.toHaveTextContent(/exists|0312345678|boom/);
  });

  it("puts a field the BE refused back under its input", async () => {
    vi.spyOn(api, "post").mockRejectedValue(
      new ApiError(400, "VALIDATION_FAILED", "invalid", [
        { field: "email", message: "Email không đúng định dạng" },
      ]),
    );
    renderWithProviders(<OpenAccountScreen />);
    await fill();
    await consent();
    await send();
    expect(await screen.findByText("Email không đúng định dạng")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
  });

  it("offers the province list when it loads, and sends the province's name", async () => {
    Element.prototype.scrollIntoView = vi.fn();
    provinces.state = {
      provinces: [
        { value: "79", label: "Thành phố Hồ Chí Minh" },
        { value: "1", label: "Thành phố Hà Nội" },
      ],
      error: null,
    };
    const post = vi.spyOn(api, "post").mockResolvedValue({ data: { received: true } });
    renderWithProviders(<OpenAccountScreen />);
    await fill({ "Tỉnh/Thành phố": "" });
    await userEvent.click(screen.getByRole("combobox", { name: "Tỉnh/Thành phố" }));
    await userEvent.click(await screen.findByRole("option", { name: "Thành phố Hà Nội" }));
    await consent();
    await send();
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        "/public/leads",
        expect.objectContaining({ province: "Thành phố Hà Nội" }),
      ),
    );
  });
});
