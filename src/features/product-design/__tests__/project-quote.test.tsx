import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/error";
import { MOCK_DESIGN_IDS } from "@/lib/api/mock-fixtures/design-seed";
import { settle } from "@/test/fake-backend";
import { renderWithProviders, signIn, signOut } from "@/test/render";

import {
  addDesignToProject,
  archiveProject,
  createProject,
  getProject,
  requestProjectQuote,
} from "../api";
import { ProjectQuoteSection } from "../components/project-quote-section";
import { designBackend, type DesignBackend } from "./design-backend";

// "Yêu cầu báo giá cả dự án" (docs 12 §4.11) on the project page, over the design mock: one row per
// APPROVED design, cartons per chosen design and one shared date, the body sent, a refusal of a line
// under that line, and nothing to ask on a closed project or one without an approved design.

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

/** A project with the given designs; `pending` is approved first when it is one of them. */
async function projectWith(...ids: string[]) {
  if (ids.includes(pending)) settle(await backend.store.simulateApprove(pending));
  const { id } = await createProject({ name: "Bộ ly quán Nhà Mình" });
  for (const designId of ids) await addDesignToProject(id, designId);
  return getProject(id);
}

async function renderSection(projectId: string) {
  const project = await getProject(projectId);
  backend.post.mockClear();
  renderWithProviders(<ProjectQuoteSection project={project} designs={project.designs} />);
  return project;
}

const openDialog = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(
    await screen.findByRole("button", { name: "Yêu cầu báo giá cả dự án" }, FIRST_READ),
  );
  return screen.findByRole("dialog");
};

describe("ProjectQuoteSection", () => {
  it("asks over the chosen approved designs with one date, then shows the request", async () => {
    const user = userEvent.setup();
    const { id } = await projectWith(approved, pending, draft);
    await renderSection(id);
    expect(
      await screen.findByText("Dự án chưa có yêu cầu báo giá nào.", undefined, FIRST_READ),
    ).toBeInTheDocument();

    const dialog = await openDialog(user);
    // The draft is not offered: only APPROVED designs can be quoted (BR-15).
    const rows = within(dialog).getAllByRole("checkbox");
    expect(rows).toHaveLength(2);
    expect(within(dialog).queryByText("Túi kraft tiệm bánh Hoa")).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Gửi yêu cầu" }));
    expect(await within(dialog).findByText("Chọn ít nhất một bản đã duyệt.")).toBeInTheDocument();

    await user.click(within(dialog).getByLabelText(/Ly cà phê Nhà Mình 12oz/));
    await user.type(within(dialog).getByLabelText("Số thùng mong muốn"), "40");
    await user.type(
      within(dialog).getByLabelText("Ngày giao mong muốn chung (không bắt buộc)"),
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
    expect(within(dialog).getByRole("link", { name: "Mở chat" })).toHaveAttribute("href", "/chat");
    expect(backend.post).toHaveBeenCalledWith(`/design-projects/${id}/quote-requests`, {
      lines: [{ designId: approved, cartons: 40 }],
      desiredDeliveryDate: "2099-12-31",
    });

    await user.click(within(dialog).getByRole("button", { name: "Đóng" }));
    const lines = await screen.findByRole("list", { name: "Các bản trong yêu cầu" });
    expect(within(lines).getByText("Ly cà phê Nhà Mình 12oz")).toBeInTheDocument();
    expect(within(lines).getByText("40 thùng")).toBeInTheDocument();
    expect(screen.getByText("Đang chờ báo giá")).toBeInTheDocument();
  });

  it("starts from the open request and says it was updated (200)", async () => {
    const user = userEvent.setup();
    const { id } = await projectWith(approved);
    await requestProjectQuote(id, { lines: [{ designId: approved, cartons: 10 }] });
    await renderSection(id);
    await screen.findByText("10 thùng", undefined, FIRST_READ);

    const dialog = await openDialog(user);
    const cartons = within(dialog).getByLabelText("Số thùng mong muốn");
    expect(cartons).toHaveValue(10);
    await user.clear(cartons);
    await user.type(cartons, "25");
    await user.click(within(dialog).getByRole("button", { name: "Cập nhật yêu cầu" }));
    expect(
      await within(dialog).findByText("Đã cập nhật yêu cầu.", undefined, FIRST_READ),
    ).toBeInTheDocument();
  });

  it("puts the BE's refusal of a line under that line, counting only the lines sent", async () => {
    const user = userEvent.setup();
    const { id } = await projectWith(approved, pending);
    const project = await renderSection(id);
    const second = project.designs.filter((d) => d.status === "APPROVED")[1]!;
    backend.post.mockRejectedValueOnce(
      new ApiError(400, "VALIDATION_FAILED", "Dữ liệu không hợp lệ.", [
        { field: "lines[0].cartons", message: "Số thùng từ 1 đến 1.000.000.", code: "Max" },
      ]),
    );

    const dialog = await openDialog(user);
    await user.click(within(dialog).getByLabelText(new RegExp(second.name)));
    const cartons = within(dialog).getByLabelText("Số thùng mong muốn");
    await user.type(cartons, "999");
    await user.click(within(dialog).getByRole("button", { name: "Gửi yêu cầu" }));

    await waitFor(() => expect(cartons).toHaveAttribute("aria-invalid", "true"));
    expect(within(dialog).getByText("Số thùng từ 1 đến 1.000.000.")).toBeInTheDocument();
  });

  it("offers no ask on a project without an approved design, and says why", async () => {
    const { id } = await projectWith(draft);
    await renderSection(id);
    const button = await screen.findByRole(
      "button",
      { name: "Yêu cầu báo giá cả dự án" },
      FIRST_READ,
    );
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription("Cần ít nhất một bản đã duyệt trong dự án.");
  });

  it("offers no ask on a closed project, but still shows its request", async () => {
    const { id } = await projectWith(approved);
    await requestProjectQuote(id, { lines: [{ designId: approved, cartons: 10 }] });
    await archiveProject(id, { version: (await getProject(id)).version });
    await renderSection(id);

    expect(await screen.findByText("10 thùng", undefined, FIRST_READ)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Yêu cầu báo giá cả dự án" }),
    ).not.toBeInTheDocument();
  });
});
