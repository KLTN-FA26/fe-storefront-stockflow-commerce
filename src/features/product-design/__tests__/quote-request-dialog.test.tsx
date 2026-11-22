import { render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/error";
import { MOCK_DESIGN_IDS } from "@/lib/api/mock-fixtures/design-seed";
import { registerMockRoute } from "@/lib/api/mock-adapter";
import { settle } from "@/test/fake-backend";
import { renderWithProviders, signIn, signOut } from "@/test/render";

import { getDesign } from "../api";
import { DesignQuoteSummary, RequestQuoteButton } from "../components/design-quote-request";
import type { Design } from "../types";
import { designBackend, type DesignBackend } from "./design-backend";

// "Yêu cầu báo giá" on an approved design (docs 12 §4.8.23) over the design mock: the open request
// on its card, the dialog's checks, the answer for a new request (201) and for a changed one (200),
// the BE's refusals under their field or in an alert, and the permission that offers the button.

const { draft, pending, approved } = MOCK_DESIGN_IDS;
// Several mock round trips (~0.2 s each) per test: room for a loaded parallel run.
vi.setConfig({ testTimeout: 15_000 });

const FIRST_READ = { timeout: 3000 } as const;

let backend: DesignBackend;
beforeEach(async () => {
  signIn();
  backend = await designBackend();
});
afterEach(() => {
  vi.restoreAllMocks();
  signOut();
});

function renderDesign(design: Design) {
  return renderWithProviders(
    <>
      <DesignQuoteSummary design={design} />
      <RequestQuoteButton design={design} />
    </>,
  );
}

async function openDialog(user: ReturnType<typeof userEvent.setup>, design: Design) {
  await user.click(
    await screen.findByRole("button", { name: `Yêu cầu báo giá ${design.name}` }, FIRST_READ),
  );
  return screen.findByRole("dialog");
}

describe("an approved design's quote request", () => {
  it("shows the open request on the card: cartons, date, status and the customer's SKU", async () => {
    renderDesign(await getDesign(approved));
    const facts = await screen.findByRole("region", { name: "Yêu cầu báo giá" }, FIRST_READ);
    expect(within(facts).getByText("120 thùng")).toBeInTheDocument();
    expect(within(facts).getByText("Đang chờ báo giá")).toBeInTheDocument();
    expect(within(facts).getByText(/-KH0010-/)).toBeInTheDocument();
  });

  it("does not read a card's requests again within 5 minutes, and does after", async () => {
    const design = await getDesign(approved);
    const url = `/designs/${approved}/quote-requests`;
    const reads = () => backend.get.mock.calls.filter(([path]) => path === url).length;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const show = () =>
      render(
        <QueryClientProvider client={client}>
          <DesignQuoteSummary design={design} />
        </QueryClientProvider>,
      );
    const first = show();
    await screen.findByRole("region", { name: "Yêu cầu báo giá" }, FIRST_READ);
    first.unmount();
    expect(reads()).toBe(1);

    // Only the clock moves: the 60 s of a detail read are over, the 5 minutes of a card are not.
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(Date.now() + 2 * 60_000);
      const again = show();
      await screen.findByRole("region", { name: "Yêu cầu báo giá" }, FIRST_READ);
      expect(reads()).toBe(1);
      again.unmount();

      vi.setSystemTime(Date.now() + 4 * 60_000);
      show();
      await waitFor(() => expect(reads()).toBe(2), FIRST_READ);
    } finally {
      vi.useRealTimers();
    }
  });

  it("reads nothing for a plain draft, and offers no button on it", async () => {
    const design = await getDesign(draft);
    backend.get.mockClear();
    renderDesign(design);
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(backend.get.mock.calls.map(([url]) => url)).not.toContain(
      `/designs/${draft}/quote-requests`,
    );
    expect(screen.queryByRole("button", { name: /Yêu cầu báo giá/ })).not.toBeInTheDocument();
  });

  it("checks the fields before sending: cartons required and a whole number in range, no past date", async () => {
    const user = userEvent.setup();
    settle(await backend.store.simulateApprove(pending));
    const design = await getDesign(pending);
    renderDesign(design);
    const dialog = await openDialog(user, design);

    await user.click(within(dialog).getByRole("button", { name: "Gửi yêu cầu" }));
    expect(await within(dialog).findByText("Nhập số thùng mong muốn.")).toBeInTheDocument();

    await user.type(within(dialog).getByLabelText("Số thùng mong muốn"), "0");
    await user.type(
      within(dialog).getByLabelText("Ngày giao mong muốn (không bắt buộc)"),
      "2020-01-01",
    );
    await user.click(within(dialog).getByRole("button", { name: "Gửi yêu cầu" }));
    expect(await within(dialog).findByText("Số thùng từ 1 đến 1.000.000.")).toBeInTheDocument();
    expect(
      within(dialog).getByText("Ngày giao mong muốn phải từ hôm nay trở đi."),
    ).toBeInTheDocument();
    expect(backend.post).not.toHaveBeenCalled();
    // Only a suggestion: the hint says so.
    expect(within(dialog).getByText(/Chỉ là gợi ý/)).toBeInTheDocument();
  });

  it("sends a new request (201): says Sale will answer in the chat and opens it", async () => {
    const user = userEvent.setup();
    settle(await backend.store.simulateApprove(pending));
    const design = await getDesign(pending);
    renderDesign(design);
    const dialog = await openDialog(user, design);

    await user.type(within(dialog).getByLabelText("Số thùng mong muốn"), "50");
    await user.type(
      within(dialog).getByLabelText("Ngày giao mong muốn (không bắt buộc)"),
      "2099-12-31",
    );
    await user.click(within(dialog).getByRole("button", { name: "Gửi yêu cầu" }));

    expect(
      await within(dialog).findByText(
        "Đã gửi yêu cầu, Sale sẽ liên hệ qua chat.",
        undefined,
        FIRST_READ,
      ),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: "Mở chat" })).toHaveAttribute(
      "href",
      `/chat/new?kind=DESIGN&id=${pending}`,
    );
    expect(backend.post).toHaveBeenCalledWith(`/designs/${pending}/quote-requests`, {
      cartons: 50,
      desiredDeliveryDate: "2099-12-31",
    });
    // The card follows once the dialog is closed: the request is the one it shows now.
    await user.click(within(dialog).getByRole("button", { name: "Đóng" }));
    const facts = await screen.findByRole("region", { name: "Yêu cầu báo giá" });
    expect(within(facts).getByText("50 thùng")).toBeInTheDocument();
  });

  it("changes the open request (200): starts from it and says it was updated", async () => {
    const user = userEvent.setup();
    const design = await getDesign(approved);
    renderDesign(design);
    await screen.findByText("120 thùng", undefined, FIRST_READ);
    const dialog = await openDialog(user, design);

    expect(within(dialog).getByRole("heading", { name: "Cập nhật yêu cầu báo giá" })).toBeVisible();
    const cartons = within(dialog).getByLabelText("Số thùng mong muốn");
    expect(cartons).toHaveValue(120);
    await user.clear(cartons);
    await user.type(cartons, "200");
    await user.click(within(dialog).getByRole("button", { name: "Cập nhật yêu cầu" }));

    expect(
      await within(dialog).findByText("Đã cập nhật yêu cầu.", undefined, FIRST_READ),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: "Mở chat" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByText("200 thùng").length).toBeGreaterThan(0));
  });

  it("puts a field the BE refused under that field", async () => {
    const user = userEvent.setup();
    const design = await getDesign(approved);
    renderDesign(design);
    await screen.findByText("120 thùng", undefined, FIRST_READ);
    backend.post.mockRejectedValueOnce(
      new ApiError(400, "VALIDATION_FAILED", "Dữ liệu không hợp lệ.", [
        {
          field: "desiredDeliveryDate",
          message: "Ngày giao mong muốn phải từ hôm nay trở đi.",
          code: "FutureOrPresent",
        },
      ]),
    );
    const dialog = await openDialog(user, design);
    await user.click(within(dialog).getByRole("button", { name: "Cập nhật yêu cầu" }));

    const date = within(dialog).getByLabelText("Ngày giao mong muốn (không bắt buộc)");
    await waitFor(() => expect(date).toHaveAttribute("aria-invalid", "true"));
    expect(
      within(dialog).getByText("Ngày giao mong muốn phải từ hôm nay trở đi."),
    ).toBeInTheDocument();
    // On the field, not repeated in an alert.
    expect(within(dialog).queryByText("Dữ liệu không hợp lệ.")).not.toBeInTheDocument();
  });

  it("shows the BE's words for CUSTOMER_NOT_ACTIVE and does not let the customer ask again", async () => {
    const user = userEvent.setup();
    const design = await getDesign(approved);
    renderDesign(design);
    await screen.findByText("120 thùng", undefined, FIRST_READ);
    const message =
      "Tài khoản khách hàng đang ở trạng thái SUSPENDED: chỉ khách đang hoạt động mới yêu cầu báo giá được.";
    backend.post.mockRejectedValueOnce(new ApiError(409, "CUSTOMER_NOT_ACTIVE", message));
    const dialog = await openDialog(user, design);
    await user.click(within(dialog).getByRole("button", { name: "Cập nhật yêu cầu" }));

    expect(await within(dialog).findByText(new RegExp(message))).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Cập nhật yêu cầu" })).toBeDisabled();
  });

  it("offers a retry after a network failure", async () => {
    const user = userEvent.setup();
    const design = await getDesign(approved);
    renderDesign(design);
    await screen.findByText("120 thùng", undefined, FIRST_READ);
    backend.post.mockRejectedValueOnce(
      new ApiError(0, "NETWORK_ERROR", "Không kết nối được máy chủ. Vui lòng kiểm tra mạng."),
    );
    const dialog = await openDialog(user, design);
    await user.click(within(dialog).getByRole("button", { name: "Cập nhật yêu cầu" }));

    expect(await within(dialog).findByText(/Không kết nối được máy chủ/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Thử lại" }));
    expect(
      await within(dialog).findByText("Đã cập nhật yêu cầu.", undefined, FIRST_READ),
    ).toBeInTheDocument();
  });

  it("is not offered without design-quote-requests:CREATE", async () => {
    registerMockRoute("GET", "/identity/me/permissions", () => ({
      status: 200,
      data: {
        success: true,
        data: { roles: ["CUSTOMER"], permissions: ["design-designs:READ"], dataScope: "OWN" },
      },
      headers: {},
    }));
    const design = await getDesign(approved);
    const get = vi.spyOn(api, "get");
    renderDesign(design);
    await waitFor(() =>
      expect(get.mock.calls.map(([url]) => url)).toContain("/identity/me/permissions"),
    );
    // The card still shows the request; only asking is gated.
    expect(await screen.findByText("120 thùng", undefined, FIRST_READ)).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /Yêu cầu báo giá/ })).not.toBeInTheDocument(),
    );
  });
});
