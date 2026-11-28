import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/error";
import { renderWithProviders, signIn, signOut } from "@/test/render";

import { SalesOwnerCard } from "../components/sales-owner-card";

const OWNER = "/customers/me/sales-owner";
const OPTIONS = "/customers/me/sales-options";
const REQUESTS = "/customers/me/sales-owner-change-requests";

type Answer = { data: unknown } | ApiError;
const notFound = () => new ApiError(404, "NOT_FOUND", "No static resource");

/** The BE, path by path; a path not listed answers 404 like a BE without the endpoint. */
function backend(answers: Record<string, Answer | (() => Answer)>) {
  return vi.spyOn(api, "get").mockImplementation(async (url) => {
    const entry = answers[url];
    const answer = typeof entry === "function" ? entry() : entry;
    if (!answer || answer instanceof ApiError) throw answer ?? notFound();
    return answer;
  });
}

const owner = (over: Record<string, unknown> = {}) => ({
  data: { name: "Trần Minh Khoa", active: true, coverName: null, ...over },
});
const request = (over: Record<string, unknown> = {}) => ({
  id: "r-1",
  status: "PENDING",
  reason: "SLOW_RESPONSE",
  note: "",
  createdAt: "2026-11-20T03:00:00Z",
  ...over,
});

beforeEach(() => {
  signIn();
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  vi.restoreAllMocks();
  signOut();
});

describe("SalesOwnerCard — shown or hidden (KE-HOACH sales owner §10.5)", () => {
  it("shows the Sales' name and a chat button, never a staff e-mail or phone", async () => {
    const get = backend({ [OWNER]: owner(), [REQUESTS]: { data: [] } });
    renderWithProviders(<SalesOwnerCard />);
    const card = await screen.findByRole("region", { name: "Sale phụ trách của bạn" });
    expect(get).toHaveBeenCalledWith(OWNER, expect.anything());
    expect(within(card).getByText("Trần Minh Khoa")).toBeInTheDocument();
    expect(within(card).getByRole("link", { name: "Chat với Sale" })).toHaveAttribute(
      "href",
      "/chat/new",
    );
    expect(within(card).queryByText(/hỗ trợ thay/)).not.toBeInTheDocument();
    expect(card).not.toHaveTextContent(/@|\+84/);
  });

  it("says who stands in while the Sales is away (BR-S07 cover)", async () => {
    backend({ [OWNER]: owner({ coverName: "Lê Thu Hà" }), [REQUESTS]: { data: [] } });
    renderWithProviders(<SalesOwnerCard />);
    expect(await screen.findByText("(đang có Lê Thu Hà hỗ trợ thay)")).toBeInTheDocument();
  });

  it.each([
    ["404 (BE without the endpoint)", notFound()],
    ["400 ('me' falls to a staff route)", new ApiError(400, "UNSUPPORTED_PARAMETER", "bad")],
    ["403", new ApiError(403, "FORBIDDEN", "no")],
    ["data: null (no owner)", { data: null }],
    ["no name (UNASSIGNED)", { data: { name: null, active: false, coverName: null } }],
    ["an owner whose account was closed (NEEDS_ASSIGNMENT)", owner({ active: false })],
  ])("is left out for %s", async (_case, answer) => {
    const get = backend({ [OWNER]: answer as Answer });
    const { container } = renderWithProviders(<SalesOwnerCard />);
    await waitFor(() => expect(get).toHaveBeenCalledWith(OWNER, expect.anything()));
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("is left out for a signed-out visitor, without asking the BE", () => {
    signOut();
    const get = backend({ [OWNER]: owner() });
    const { container } = renderWithProviders(<SalesOwnerCard />);
    expect(container).toBeEmptyDOMElement();
    expect(get).not.toHaveBeenCalled();
  });
});

describe("SalesOwnerCard — 'Yêu cầu đổi người hỗ trợ' (KE-HOACH §10.5, D11, D12)", () => {
  it.each([
    ["404", notFound()],
    ["403", new ApiError(403, "FORBIDDEN", "no")],
    ["500", new ApiError(500, "INTERNAL_ERROR", "boom")],
  ])("is hidden while the request endpoint answers %s; the card stays", async (_case, error) => {
    backend({ [OWNER]: owner(), [REQUESTS]: error });
    renderWithProviders(<SalesOwnerCard />);
    await screen.findByText("Trần Minh Khoa");
    await waitFor(() =>
      expect(screen.getByRole("link", { name: "Chat với Sale" })).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("button", { name: "Yêu cầu đổi người hỗ trợ" }),
    ).not.toBeInTheDocument();
  });

  it("sends the reason, the note and the preferred Sales, then shows the request waiting", async () => {
    let requests: unknown[] = [];
    backend({
      [OWNER]: owner(),
      [OPTIONS]: {
        data: [
          { userId: "u-khoa", name: "Trần Minh Khoa" },
          { userId: "u-bao", name: "Phạm Quốc Bảo" },
        ],
      },
      [REQUESTS]: () => ({ data: requests }),
    });
    const post = vi.spyOn(api, "post").mockImplementation(async () => {
      requests = [request({ note: "Cần trả lời nhanh hơn" })];
      return { data: requests[0] };
    });
    renderWithProviders(<SalesOwnerCard />);

    await userEvent.click(await screen.findByRole("button", { name: "Yêu cầu đổi người hỗ trợ" }));
    const dialog = await screen.findByRole("dialog");
    for (const label of [
      "Phản hồi chậm",
      "Chưa hài lòng với cách tư vấn",
      "Muốn làm việc với người quen",
      "Lý do khác",
    ]) {
      expect(within(dialog).getByRole("radio", { name: label })).toBeInTheDocument();
    }
    await userEvent.click(within(dialog).getByRole("radio", { name: "Phản hồi chậm" }));
    await userEvent.type(within(dialog).getByLabelText("Ghi chú"), "Cần trả lời nhanh hơn");
    await userEvent.click(within(dialog).getByRole("combobox", { name: "Sale bạn muốn làm việc" }));
    await userEvent.click(await screen.findByRole("option", { name: "Phạm Quốc Bảo" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Gửi yêu cầu" }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(REQUESTS, {
        reason: "SLOW_RESPONSE",
        note: "Cần trả lời nhanh hơn",
        preferredSalesUserId: "u-bao",
      }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const status = await screen.findByRole("status", { name: "Yêu cầu đổi người hỗ trợ gần nhất" });
    expect(status).toHaveTextContent("Chờ duyệt");
    expect(status).toHaveTextContent("Lý do: Phản hồi chậm");
    // One open request at a time: no second request while this one waits.
    expect(
      screen.queryByRole("button", { name: "Yêu cầu đổi người hỗ trợ" }),
    ).not.toBeInTheDocument();
  });

  it("sends no preferred Sales when the list is not available, and asks for a reason first", async () => {
    backend({ [OWNER]: owner(), [REQUESTS]: { data: [] } });
    const post = vi.spyOn(api, "post").mockResolvedValue({ data: request() });
    renderWithProviders(<SalesOwnerCard />);

    await userEvent.click(await screen.findByRole("button", { name: "Yêu cầu đổi người hỗ trợ" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByRole("combobox")).not.toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Gửi yêu cầu" }));
    expect(await within(dialog).findByText("Vui lòng chọn lý do")).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();

    await userEvent.click(within(dialog).getByRole("radio", { name: "Lý do khác" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Gửi yêu cầu" }));
    expect(await within(dialog).findByText("Vui lòng ghi rõ lý do")).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();

    await userEvent.type(within(dialog).getByLabelText("Ghi chú"), "Đổi khu vực");
    await userEvent.click(within(dialog).getByRole("button", { name: "Gửi yêu cầu" }));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(REQUESTS, { reason: "OTHER", note: "Đổi khu vực" }),
    );
  });

  it.each([
    ["OWNER_CHANGE_REQUEST_PENDING", "đang có một yêu cầu đổi người hỗ trợ chờ duyệt"],
    ["OWNER_CHANGE_REQUEST_COOLDOWN", "sau 30 ngày kể từ ngày có kết quả"],
  ])("explains %s in Vietnamese", async (code, text) => {
    backend({ [OWNER]: owner(), [REQUESTS]: { data: [] } });
    vi.spyOn(api, "post").mockRejectedValue(new ApiError(409, code, "English text"));
    renderWithProviders(<SalesOwnerCard />);

    await userEvent.click(await screen.findByRole("button", { name: "Yêu cầu đổi người hỗ trợ" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("radio", { name: "Phản hồi chậm" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Gửi yêu cầu" }));

    const alert = await within(dialog).findByRole("alert");
    expect(alert).toHaveTextContent(new RegExp(text, "i"));
    expect(alert).not.toHaveTextContent("English text");
  });

  it.each([
    ["APPROVED", "Đã đổi"],
    ["REJECTED", "Không chấp nhận"],
  ])("shows a decided request (%s) and lets the customer ask again", async (status, label) => {
    backend({
      [OWNER]: owner(),
      [REQUESTS]: {
        data: {
          items: [
            request({
              status,
              decisionNote: status === "REJECTED" ? "Sale hiện tại đang xử lý đơn của bạn" : null,
            }),
          ],
        },
      },
    });
    renderWithProviders(<SalesOwnerCard />);
    const card = await screen.findByRole("status", { name: "Yêu cầu đổi người hỗ trợ gần nhất" });
    expect(card).toHaveTextContent(label);
    if (status === "REJECTED") {
      expect(card).toHaveTextContent("Phản hồi: Sale hiện tại đang xử lý đơn của bạn");
    }
    expect(screen.getByRole("button", { name: "Yêu cầu đổi người hỗ trợ" })).toBeInTheDocument();
  });
});
