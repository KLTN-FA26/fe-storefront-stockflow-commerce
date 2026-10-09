import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { ApiError } from "@/lib/api/error";

import type { CustomerAddressDto } from "../types";
import { AddressForm } from "./address-form";

const snapshot: CustomerAddressDto = {
  addressId: "6f1c2a3b-4d5e-4f60-8a71-0b2c3d4e5f60",
  customerId: "CUS-0010",
  type: "SHIPPING",
  recipientName: "Nguyễn Hoài Nam",
  phone: "+84908111222",
  line1: "12 Nguyễn Huệ",
  wardCode: "26734",
  wardName: "Phường Sài Gòn",
  provinceCode: "79",
  provinceName: "Thành phố Hồ Chí Minh",
  countryCode: "VN",
  defaultAddress: true,
  version: 4,
};

// Province/ward lists come from an external API; tests rely on the saved option instead.
// jsdom has no ResizeObserver; Radix checkbox/radio measure themselves with it.
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

vi.mock("@/hooks/use-vietnam-addresses", () => ({
  useVietnamAddresses: () => ({ provinces: [], wards: [], loading: false }),
}));

function renderWithQuery(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils = render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
  return {
    ...utils,
    rerender: (next: ReactElement) =>
      utils.rerender(<QueryClientProvider client={queryClient}>{next}</QueryClientProvider>),
  };
}

describe("AddressForm", () => {
  it("submits the values with the snapshot version", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderWithQuery(<AddressForm snapshot={snapshot} onSubmit={onSubmit} />);

    await user.click(screen.getByRole("button", { name: "Lưu địa chỉ" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({ type: "SHIPPING", wardCode: "26734" });
    expect(onSubmit.mock.calls[0]?.[1]).toBe(4);
  });

  it("shows BE fieldErrors under the matching inputs", async () => {
    const error = new ApiError(400, "VALIDATION_FAILED", "Dữ liệu không hợp lệ", [
      { field: "wardCode", message: "không được để trống" },
      { field: "phone", message: "Số điện thoại không hợp lệ" },
    ]);
    renderWithQuery(<AddressForm snapshot={snapshot} onSubmit={vi.fn()} serverError={error} />);

    expect(await screen.findByText("không được để trống")).toBeInTheDocument();
    expect(screen.getByText("Số điện thoại không hợp lệ")).toBeInTheDocument();
    expect(screen.queryByText("Không lưu được địa chỉ")).not.toBeInTheDocument();
  });

  it("shows a BE error on the address type instead of swallowing it", async () => {
    const error = new ApiError(400, "VALIDATION_FAILED", "Dữ liệu không hợp lệ", [
      { field: "type", message: "không hợp lệ" },
    ]);
    renderWithQuery(<AddressForm snapshot={snapshot} onSubmit={vi.fn()} serverError={error} />);

    expect(await screen.findByText("không hợp lệ")).toBeInTheDocument();
  });

  it("links field errors to inputs for screen readers", async () => {
    const error = new ApiError(400, "VALIDATION_FAILED", "Dữ liệu không hợp lệ", [
      { field: "phone", message: "Số điện thoại không hợp lệ" },
    ]);
    renderWithQuery(<AddressForm snapshot={snapshot} onSubmit={vi.fn()} serverError={error} />);

    const phone = await screen.findByLabelText("Số điện thoại");
    await waitFor(() => expect(phone).toHaveAttribute("aria-invalid", "true"));
    expect(phone).toHaveAccessibleDescription("Số điện thoại không hợp lệ");
  });

  it("reports a broken response contract without leaking zod issues", () => {
    const contractError = z.object({ addressId: z.uuid() }).safeParse({}).error;
    renderWithQuery(<AddressForm snapshot={snapshot} onSubmit={vi.fn()} serverError={contractError} />);

    expect(screen.getByText(/Dữ liệu trả về không đúng định dạng/)).toBeInTheDocument();
    expect(screen.queryByText(/invalid_type/)).not.toBeInTheDocument();
  });

  it("does not overwrite what the customer is typing when the snapshot refetches", async () => {
    const user = userEvent.setup();
    const { rerender } = renderWithQuery(<AddressForm snapshot={snapshot} onSubmit={vi.fn()} />);

    const name = screen.getByLabelText("Người nhận");
    await user.clear(name);
    await user.type(name, "Đang gõ dở");
    rerender(
      <AddressForm
        snapshot={{ ...snapshot, recipientName: "Từ server", version: 5 }}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Người nhận")).toHaveValue("Đang gõ dở");
  });

  it("locks the default checkbox while editing the current default of that type", () => {
    renderWithQuery(<AddressForm snapshot={snapshot} onSubmit={vi.fn()} />);
    expect(screen.getByRole("checkbox")).toBeDisabled();
    expect(screen.getByText(/Hãy chọn địa chỉ khác làm mặc định/)).toBeInTheDocument();
  });

  it("lets the customer pick the billing type", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderWithQuery(
      <AddressForm snapshot={{ ...snapshot, defaultAddress: false }} onSubmit={onSubmit} />,
    );

    await user.click(screen.getByRole("radio", { name: "Thanh toán" }));
    await user.click(screen.getByRole("button", { name: "Lưu địa chỉ" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({ type: "BILLING" });
  });
});
