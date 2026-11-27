import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/error";
import { renderWithProviders, signIn, signOut } from "@/test/render";

import { CreditRequestDetail } from "../components/credit-request-detail";
import { CreditRequestSection } from "../components/credit-request-section";
import { allowedCreditRequestActions, CREDIT_REQUEST_TRANSITIONS } from "../lifecycle";
import { creditRequestSchema } from "../schemas";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const ID = "8a1f6f0e-3c36-4e0e-9a43-2b0f0d6a1c01";
/** BE CreditRequestResponse as the portal gets it: no Sales' opinion, no *By, no review. */
const request = (over: Record<string, unknown> = {}) => ({
  id: ID,
  customerId: "c-1",
  source: "PORTAL",
  status: "SUBMITTED",
  requestedLimit: 200_000_000,
  requestedTermDays: 30,
  currency: "VND",
  reason: "Mở rộng đơn",
  submittedAt: "2026-11-26T02:00:00Z",
  version: 0,
  files: [],
  ...over,
});
const page = (items: unknown[]) => ({
  items,
  page: 0,
  size: 10,
  totalElements: items.length,
  totalPages: items.length ? 1 : 0,
  hasNext: false,
  hasPrevious: false,
});

beforeEach(() => signIn());
afterEach(() => {
  vi.restoreAllMocks();
  push.mockReset();
  signOut();
});

describe("lifecycle (kltn-docs 15 §4.3)", () => {
  it("APPROVED / REJECTED / WITHDRAWN / UNKNOWN là trạng thái cuối", () => {
    for (const s of ["APPROVED", "REJECTED", "WITHDRAWN", "UNKNOWN"] as const)
      expect(CREDIT_REQUEST_TRANSITIONS[s]).toEqual([]);
  });
  it("khách rút được đề nghị mình gửi khi còn mở; đề nghị Sale gửi thay chỉ tải giấy tờ", () => {
    const parse = (over: Record<string, unknown>) => creditRequestSchema.parse(request(over));
    expect(allowedCreditRequestActions(parse({}))).toEqual(["withdraw", "attach"]);
    expect(
      allowedCreditRequestActions(parse({ source: "SALES", status: "PENDING_APPROVAL" })),
    ).toEqual(["attach"]);
    expect(allowedCreditRequestActions(parse({ status: "REJECTED" }))).toEqual([]);
  });
});

describe("CreditRequestSection (A3)", () => {
  it("chưa có đề nghị → gửi đề nghị: POST /credit-requests rồi mở trang chi tiết", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ data: page([]) });
    const post = vi.spyOn(api, "post").mockResolvedValue({ data: request() });
    renderWithProviders(<CreditRequestSection enabled />);

    await userEvent.click(await screen.findByRole("button", { name: "Gửi đề nghị cấp hạn mức" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText("Hạn mức muốn xin (₫)"), "200000000");
    await userEvent.click(within(dialog).getByRole("button", { name: "Gửi đề nghị" }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/credit-requests", {
        requestedLimit: 200_000_000,
        requestedTermDays: 30,
        reason: "",
      }),
    );
    await waitFor(() => expect(push).toHaveBeenCalledWith(`/credit-requests/${ID}`));
  });

  it("đang có đề nghị mở → không hiện nút gửi; dòng dẫn tới /credit-requests/{id}", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ data: page([request()]) });
    renderWithProviders(<CreditRequestSection enabled />);

    expect(await screen.findByText("Chờ Sale xem xét")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", `/credit-requests/${ID}`);
    expect(
      screen.queryByRole("button", { name: "Gửi đề nghị cấp hạn mức" }),
    ).not.toBeInTheDocument();
  });

  it("CREDIT_REQUEST_ALREADY_OPEN → câu tiếng Việt trong hộp thoại", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ data: page([]) });
    vi.spyOn(api, "post").mockRejectedValue(
      new ApiError(409, "CREDIT_REQUEST_ALREADY_OPEN", "Customer has an open request"),
    );
    renderWithProviders(<CreditRequestSection enabled />);
    await userEvent.click(await screen.findByRole("button", { name: "Gửi đề nghị cấp hạn mức" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText("Hạn mức muốn xin (₫)"), "100");
    await userEvent.click(within(dialog).getByRole("button", { name: "Gửi đề nghị" }));
    expect(
      await within(dialog).findByText(/Bạn đang có một đề nghị chờ xử lý/),
    ).toBeInTheDocument();
  });
});

describe("CreditRequestDetail (A4)", () => {
  it("bị từ chối → hiện lý do của kế toán, không còn nút rút", async () => {
    vi.spyOn(api, "get").mockResolvedValue({
      data: request({ status: "REJECTED", decisionNote: "Lịch sử thanh toán còn ngắn." }),
    });
    renderWithProviders(<CreditRequestDetail id={ID} />);
    expect(await screen.findByText("Lý do: Lịch sử thanh toán còn ngắn.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Rút đề nghị" })).not.toBeInTheDocument();
  });

  it("còn mở → Rút đề nghị gửi version", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ data: request({ version: 2 }) });
    const post = vi
      .spyOn(api, "post")
      .mockResolvedValue({ data: request({ status: "WITHDRAWN", version: 3 }) });
    renderWithProviders(<CreditRequestDetail id={ID} />);
    await userEvent.click(await screen.findByRole("button", { name: "Rút đề nghị" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Rút đề nghị" }));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(`/credit-requests/${ID}/withdrawal`, { version: 2 }),
    );
  });

  it("đề nghị của khách khác (404) → không tìm thấy", async () => {
    vi.spyOn(api, "get").mockRejectedValue(
      new ApiError(404, "CREDIT_REQUEST_NOT_FOUND", "Credit request not found"),
    );
    renderWithProviders(<CreditRequestDetail id={ID} />);
    expect(await screen.findByText("Không tìm thấy đề nghị")).toBeInTheDocument();
  });
});
