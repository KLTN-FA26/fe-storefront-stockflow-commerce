import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "@/test/render";

import { ProjectSteps } from "../components/project-steps";
import type { ProjectQuoteRequest } from "../types";
import { design } from "./fixtures";

// "1 Thiết kế → 2 Duyệt → 3 Báo giá" on the project page (UI/UX 27/11, sf-12): the current step and
// at most one primary action for it, never a row of locked buttons.

const id = (n: number) => `7c1f0a00-0000-4000-8000-0000000002${10 + n}`;
const drafts = (n: number) =>
  Array.from({ length: n }, (_, i) => design({ id: id(i), status: "DRAFT" }));

const request = (over: Partial<ProjectQuoteRequest> = {}): ProjectQuoteRequest => ({
  id: "9a000000-0000-4000-8000-000000000001",
  projectId: "9b000000-0000-4000-8000-000000000001",
  projectName: "Bộ ly",
  status: "OPEN",
  requestedAt: "2026-11-26T08:00:00Z",
  lines: [],
  ...over,
});

const allowed = { allowed: true };
const base = {
  createGate: allowed,
  quoteRequest: null,
  mayAskQuote: true,
  onAskQuote: vi.fn(),
};

const current = () =>
  within(screen.getByRole("list")).getByRole("listitem", { current: "step" }).textContent;

describe("ProjectSteps", () => {
  it("starts at Thiết kế and points at the header's buttons while there are too few drafts", () => {
    renderWithProviders(<ProjectSteps {...base} stage="design" designs={drafts(1)} />);
    expect(current()).toMatch(/Thiết kế/);
    expect(screen.getByText(/Từ 2 bản nháp, bạn gửi duyệt cả bộ/)).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("says why a design cannot be made here (a phone), without a locked button", () => {
    renderWithProviders(
      <ProjectSteps
        {...base}
        stage="design"
        designs={[]}
        createGate={{ allowed: false, reason: "Tạo bản thiết kế trên máy tính" }}
      />,
    );
    expect(screen.getByText("Tạo bản thiết kế trên máy tính")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("tells how to send the set once there are enough drafts", () => {
    renderWithProviders(<ProjectSteps {...base} stage="design" designs={drafts(2)} />);
    expect(screen.getByText(/bấm “Gửi duyệt cả bộ” ở cuối trang/)).toBeInTheDocument();
  });

  it("marks Thiết kế done while the shop reviews", () => {
    renderWithProviders(
      <ProjectSteps {...base} stage="review" designs={[design({ status: "PENDING_REVIEW" })]} />,
    );
    expect(current()).toMatch(/Duyệt/);
    expect(screen.getByText(/Bước 1 \(đã xong\)/)).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("offers one primary action at Báo giá: ask for the project quote", async () => {
    const onAskQuote = vi.fn();
    renderWithProviders(
      <ProjectSteps
        {...base}
        onAskQuote={onAskQuote}
        stage="quote"
        designs={[design({ status: "APPROVED" })]}
      />,
    );
    expect(current()).toMatch(/Báo giá/);
    await userEvent.click(screen.getByRole("button", { name: "Yêu cầu báo giá cả dự án" }));
    expect(onAskQuote).toHaveBeenCalledOnce();
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("says the request is with Sale while it is open", () => {
    renderWithProviders(
      <ProjectSteps
        {...base}
        stage="quote"
        designs={[design({ status: "APPROVED" })]}
        quoteRequest={request()}
      />,
    );
    expect(screen.getByText(/Đã gửi yêu cầu báo giá/)).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("leads to the quote once Sale answered with one", () => {
    const quoteId = "5a1e0000-0000-4000-8000-000000000001";
    renderWithProviders(
      <ProjectSteps
        {...base}
        stage="quote"
        designs={[design({ status: "APPROVED" })]}
        quoteRequest={request({
          status: "CLOSED",
          closedOutcome: "QUOTED",
          quoteId,
          quoteNumber: "QT-20261126-0001",
        })}
      />,
    );
    expect(screen.getByRole("link", { name: "Xem báo giá QT-20261126-0001" })).toHaveAttribute(
      "href",
      `/account/quotes/${quoteId}`,
    );
  });
});
