import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MOCK_DESIGN_IDS } from "@/lib/api/mock-fixtures/design-seed";
import { renderWithProviders, signIn, signOut } from "@/test/render";

import { CheckChipView, summarizeCheck } from "../components/studio/check-chip";
import { DesignStudio } from "../components/studio/design-studio";
import type { PreflightIssue, PreflightReport } from "../engine";
import { designBackend } from "./design-backend";
import { TEST_FONTS } from "./fixtures";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.setConfig({ testTimeout: 15_000 });

beforeEach(() => {
  signIn();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(null, { status: 404 })),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  signOut();
});

const issue = (
  level: PreflightIssue["level"],
  ruleId: PreflightIssue["ruleId"],
): PreflightIssue => ({
  level,
  ruleId,
  message: `m ${ruleId}`,
});
const pass: PreflightReport = { result: "Pass", issues: [] };
const notes: PreflightReport = {
  result: "Pass",
  issues: [issue("note", "CMYK_CONVERSION"), issue("note", "TOO_MANY_COLORS")],
};
const fail: PreflightReport = {
  result: "Fail",
  issues: [
    issue("fail", "EMPTY_DESIGN"),
    issue("fail", "ASSET_INVALID"),
    issue("fail", "ON_SEAM"),
    issue("note", "TOO_THIN"),
  ],
};

describe("summarizeCheck", () => {
  it("says đạt for a pass with nothing to note", () => {
    expect(summarizeCheck(pass)).toEqual({ text: "Kiểm tra: đạt", tone: "positive" });
  });
  it("counts the failures, not the notes, for a fail", () => {
    expect(summarizeCheck(fail)).toEqual({ text: "Kiểm tra: 3 lỗi", tone: "danger" });
  });
  it("counts the notes for a pass that has some", () => {
    expect(summarizeCheck(notes)).toEqual({ text: "Kiểm tra: 2 lưu ý", tone: "warning" });
  });
});

const CLASSES = {
  positive: "text-positive",
  danger: "text-danger bg-danger/10",
  warning: "text-warning",
} as const;

describe("CheckChipView", () => {
  it.each([
    [pass, "Kiểm tra: đạt", "positive"],
    [fail, "Kiểm tra: 3 lỗi", "danger"],
    [notes, "Kiểm tra: 2 lưu ý", "warning"],
  ] as const)("shows %#: its words and tone", (report, text, tone) => {
    render(<CheckChipView summary={summarizeCheck(report)} onOpen={() => {}} />);
    const chip = screen.getByRole("button", { name: new RegExp(text) });
    expect(chip).toHaveTextContent(text);
    expect(chip).toHaveAttribute("data-tone", tone);
    expect(chip).toHaveClass(CLASSES[tone]);
  });

  it("calls onOpen on every click, so it never closes a panel", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(<CheckChipView summary={summarizeCheck(pass)} onOpen={onOpen} />);
    await user.click(screen.getByRole("button"));
    await user.click(screen.getByRole("button"));
    expect(onOpen).toHaveBeenCalledTimes(2);
  });
});

describe("the chip in the studio header", () => {
  async function openStudio(designId: string) {
    renderWithProviders(<DesignStudio designId={designId} fonts={TEST_FONTS} />);
    await screen.findByRole("group", { name: /^Khung vẽ/ }, { timeout: 4000 });
  }

  it("opens the Kiểm tra panel, and keeps it open when pressed again", async () => {
    const user = userEvent.setup();
    await designBackend();
    await openStudio(MOCK_DESIGN_IDS.draft);
    expect(screen.queryByRole("region", { name: "Kiểm tra trước khi in" })).not.toBeInTheDocument();

    const chip = await screen.findByRole("button", { name: /^Kiểm tra: / });
    await user.click(chip);
    expect(screen.getByRole("region", { name: "Kiểm tra trước khi in" })).toBeInTheDocument();
    await user.click(chip);
    expect(screen.getByRole("region", { name: "Kiểm tra trước khi in" })).toBeInTheDocument();
  });

  it("gets the focus back when the panel it opened closes, by its button or by Esc", async () => {
    const user = userEvent.setup();
    await designBackend();
    await openStudio(MOCK_DESIGN_IDS.draft);
    const chip = await screen.findByRole("button", { name: /^Kiểm tra: / });

    await user.click(chip);
    await user.click(screen.getByRole("button", { name: "Đóng bảng" }));
    expect(chip).toHaveFocus();

    await user.click(chip);
    act(() => screen.getByRole("button", { name: "Đóng bảng" }).focus());
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("region", { name: "Kiểm tra trước khi in" })).not.toBeInTheDocument();
    expect(chip).toHaveFocus();
  });

  it("leaves focus to the rail item once the rail opened the panel instead", async () => {
    const user = userEvent.setup();
    await designBackend();
    await openStudio(MOCK_DESIGN_IDS.draft);
    await user.click(await screen.findByRole("button", { name: /^Kiểm tra: / }));
    const layers = within(screen.getByRole("group", { name: "Công cụ" })).getByRole("button", {
      name: "Lớp",
    });

    await user.click(layers);
    await user.click(screen.getByRole("button", { name: "Đóng bảng" }));
    expect(layers).toHaveFocus();
  });

  it("is there for a design that is read-only", async () => {
    const user = userEvent.setup();
    await designBackend();
    await openStudio(MOCK_DESIGN_IDS.approved);
    await user.click(await screen.findByRole("button", { name: /^Kiểm tra: / }));
    expect(screen.getByRole("region", { name: "Kiểm tra trước khi in" })).toBeInTheDocument();
  });
});
