import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/error";

import { AddressEditor } from "./address-editor";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), back: vi.fn() }) }));
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

const profile = {
  customerId: "CUS-0010",
  userId: "USER-CUS-0010",
  fullName: "Nguyễn Hoài Nam",
  email: "nam.nguyen@example.vn",
  // phone/segmentId omitted: BE serialises with NON_NULL
  status: "ACTIVE",
  version: 0,
  createdAt: "2026-01-10T02:00:00Z",
};
const ADDRESS_ID = "6f1c2a3b-4d5e-4f60-8a71-0b2c3d4e5f60";

function renderEditor() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AddressEditor addressId={ADDRESS_ID} />
    </QueryClientProvider>,
  );
}

afterEach(() => vi.restoreAllMocks());

describe("AddressEditor states", () => {
  it("shows the real load error with a retry, not 'address not found'", async () => {
    const user = userEvent.setup();
    const get = vi
      .spyOn(api, "get")
      .mockResolvedValueOnce({ data: profile })
      .mockRejectedValueOnce(
        new ApiError(500, "INTERNAL_ERROR", "Lỗi máy chủ", undefined, "corr-1"),
      )
      .mockResolvedValueOnce({ data: [] });
    renderEditor();

    expect(await screen.findByText("Không tải được sổ địa chỉ")).toBeInTheDocument();
    expect(screen.getByText(/corr-1/)).toBeInTheDocument();
    expect(screen.queryByText("Không tìm thấy địa chỉ")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(await screen.findByText("Không tìm thấy địa chỉ")).toBeInTheDocument();
    expect(get).toHaveBeenLastCalledWith("/v1/customers/CUS-0010/addresses", expect.anything());
  });

  it("treats a /me response without customerId as a contract error", async () => {
    vi.spyOn(api, "get").mockResolvedValueOnce({ data: { fullName: "Nguyễn Hoài Nam" } });
    renderEditor();

    expect(await screen.findByText(/Dữ liệu trả về không đúng định dạng/)).toBeInTheDocument();
  });

  it("explains a missing customer profile instead of a generic error", async () => {
    vi.spyOn(api, "get").mockRejectedValueOnce(
      new ApiError(404, "CUSTOMER_NOT_FOUND", "Customer not found"),
    );
    renderEditor();

    expect(await screen.findByText("Chưa có hồ sơ khách hàng")).toBeInTheDocument();
  });
});
