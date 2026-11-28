import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api/client";
import { MOCK_DESIGN_IDS } from "@/lib/api/mock-fixtures/design-seed";
import { registerMockRoute } from "@/lib/api/mock-adapter";
import { renderWithProviders, signIn, signOut } from "@/test/render";

import { getDesign, listDesigns } from "../api";
import { designKeys } from "../queries";
import { COLOR_DISCLAIMER } from "../components/color-disclaimer";
import { DesignCard } from "../components/design-card";
import { DeleteDesignDialog } from "../components/delete-design-dialog";
import { DesignListBody } from "../components/design-list-body";
import { QuoteRequestFacts } from "../components/design-quote-request";
import { FailedIssues } from "../components/studio/preflight-panel";
import { StatusBanner } from "../components/studio/status-banner";
import { StudioProvider, type StudioServices } from "../components/studio/studio-context";
import type { DesignQuoteRequest, ReportedPreflightIssue } from "../types";
import { designBackend } from "./design-backend";
import { design, ids } from "./fixtures";

// WF-02 SF-3: the customer is told what to do next (audit items 18-21, 42-44).

vi.setConfig({ testTimeout: 15_000 });
const FIRST_READ = { timeout: 3000 } as const;
const PRODUCT_ID = "9a1c0000-0000-4000-8000-0000000000b1";

beforeEach(async () => {
  signIn();
  await designBackend();
});
afterEach(() => {
  vi.restoreAllMocks();
  signOut();
});

const fail = (ruleId: string): ReportedPreflightIssue =>
  ({ ruleId, level: "fail", message: `Lỗi ${ruleId}` }) as ReportedPreflightIssue;

function renderIssues(
  issues: ReportedPreflightIssue[],
  productId: string | null,
  productStatus = "PUBLISHED",
) {
  const services = {
    surfaces: { order: [] },
    template: { printAreas: [] },
    printConfig: { product: { slug: "ly", title: "Ly giấy", status: productStatus } },
    design: design({ product: { id: productId, slug: "ly", title: "Ly giấy" } }),
  } as unknown as StudioServices;
  return renderWithProviders(
    <StudioProvider value={services}>
      <FailedIssues issues={issues} onLocate={() => undefined} />
    </StudioProvider>,
  );
}

describe("Chat với Sale on a preflight failure only Sale can clear (item 19)", () => {
  // PO 2026-11-22 (Q7): as the BE — the conversation is about the design itself, whatever its
  // status; Sale sees its name and status, never a draft's content.
  it.each([
    ["NO_CARTON_SPEC", "Sale sẽ bổ sung quy cách thùng cho bạn."],
    ["VARIANT_UNAVAILABLE", "Sale sẽ giúp bạn chọn quy cách khác."],
    // A check this build has no words for (SF-UX-12): no code to act on, so Sale is the way out.
    ["BLEED_MISSING", "Sale sẽ xem lỗi này và hướng dẫn bạn."],
  ])("%s offers the chat about the design", async (ruleId, line) => {
    renderIssues([fail(ruleId)], PRODUCT_ID);
    expect(await screen.findByText(line)).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: /Chat với Sale/ })).toHaveAttribute(
      "href",
      `/chat/new?kind=DESIGN&id=${ids.design}`,
    );
  });

  it.each([
    ["an APPROVED product", PRODUCT_ID, "APPROVED"],
    ["an UNPUBLISHED product", PRODUCT_ID, "UNPUBLISHED"],
    ["no product id", null, "PUBLISHED"],
  ])("opens the chat about the design whatever the product (%s)", async (_, productId, status) => {
    renderIssues([fail("NO_CARTON_SPEC")], productId, status);
    expect(await screen.findByRole("link", { name: /Chat với Sale/ })).toHaveAttribute(
      "href",
      `/chat/new?kind=DESIGN&id=${ids.design}`,
    );
  });

  it("offers no chat link without chat-conversations:CREATE", async () => {
    const get = vi.spyOn(api, "get").mockImplementation(async (url: string) => {
      if (url === "/identity/me/permissions") {
        return { data: { roles: ["CUSTOMER"], permissions: [], dataScope: "OWN" } };
      }
      throw new Error(`unexpected GET ${url}`);
    });
    renderIssues([fail("NO_CARTON_SPEC")], PRODUCT_ID);
    expect(await screen.findByText("Sale sẽ bổ sung quy cách thùng cho bạn.")).toBeInTheDocument();
    await waitFor(() =>
      expect(get).toHaveBeenCalledWith("/identity/me/permissions", expect.anything()),
    );
    await waitFor(() =>
      expect(screen.queryByRole("link", { name: /Chat với Sale/ })).not.toBeInTheDocument(),
    );
  });

  it("offers nothing for a failure the customer fixes in the design", () => {
    renderIssues([fail("EMPTY_DESIGN")], PRODUCT_ID);
    expect(screen.getByText("Lỗi EMPTY_DESIGN")).toBeInTheDocument();
    expect(screen.queryByText(/^Sale sẽ/)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Chat với Sale/ })).not.toBeInTheDocument();
  });
});

describe("a returned draft's quote request (item 21)", () => {
  const request = (over: Record<string, unknown>) =>
    ({
      id: "r1",
      designId: ids.design,
      designName: "Ly",
      designStatus: "DRAFT",
      cartons: 10,
      status: "OPEN",
      requestedAt: "2026-11-01T00:00:00Z",
      ...over,
    }) as DesignQuoteRequest;

  it("tells the customer to fix the draft and submit again, not to wait for approval", () => {
    renderWithProviders(<QuoteRequestFacts request={request({ returnReason: "Logo bị mờ" })} />);
    expect(screen.getByText(/Sửa theo lý do trả lại rồi gửi duyệt lại/)).toBeInTheDocument();
    expect(screen.queryByText(/Sale đã nhận yêu cầu/)).not.toBeInTheDocument();
  });

  it("keeps the old sentence for a design waiting for review", () => {
    renderWithProviders(
      <QuoteRequestFacts request={request({ designStatus: "PENDING_REVIEW" })} />,
    );
    expect(screen.getByText(/Sale đã nhận yêu cầu và sẽ báo giá/)).toBeInTheDocument();
    expect(screen.queryByText(/Sửa theo lý do trả lại/)).not.toBeInTheDocument();
  });
});

describe("an answered quote request (SF-UX-10, R5-5)", () => {
  const QUOTE_ID = "01a2043f-3d65-706a-9d7b-dcc7bff017d6";
  const closed = (over: Record<string, unknown>) =>
    ({
      id: "r1",
      designId: ids.design,
      designName: "Ly",
      designStatus: "APPROVED",
      cartons: 10,
      status: "CLOSED",
      requestedAt: "2026-11-01T00:00:00Z",
      closedAt: "2026-11-02T00:00:00Z",
      ...over,
    }) as DesignQuoteRequest;

  it("says a quote answered it, names the quote and links to it", () => {
    renderWithProviders(
      <QuoteRequestFacts
        request={closed({
          closedOutcome: "QUOTED",
          quoteId: QUOTE_ID,
          quoteNumber: "QT-20261123-0001",
        })}
      />,
    );
    expect(screen.getByText("Đã có báo giá")).toBeInTheDocument();
    expect(screen.queryByText("Đã đóng")).not.toBeInTheDocument();
    expect(screen.getByText("QT-20261123-0001")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Xem báo giá" })).toHaveAttribute(
      "href",
      `/account/quotes/${QUOTE_ID}`,
    );
  });

  it("without a link (the card has its own button) it still names the quote", () => {
    renderWithProviders(
      <QuoteRequestFacts
        quoteLink={false}
        request={closed({
          closedOutcome: "QUOTED",
          quoteId: QUOTE_ID,
          quoteNumber: "QT-20261123-0001",
        })}
      />,
    );
    expect(screen.getByText("QT-20261123-0001")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Xem báo giá" })).not.toBeInTheDocument();
  });

  it("WF-02 FE-2: closed as QUOTED before the quote is sent reads 'Sale đang soạn báo giá', no link", () => {
    renderWithProviders(<QuoteRequestFacts request={closed({ closedOutcome: "QUOTED" })} />);
    const badge = screen.getByText("Sale đang soạn báo giá");
    expect(badge).toHaveAttribute("data-tone", "info");
    expect(screen.queryByText("Đã đóng")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Xem báo giá" })).not.toBeInTheDocument();
  });

  it("reads 'Đã đóng' with no link when closed without a quote", () => {
    for (const request of [closed({ closedOutcome: "CLOSED_BY_STAFF" }), closed({})]) {
      const view = renderWithProviders(<QuoteRequestFacts request={request} />);
      expect(screen.getByText("Đã đóng")).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "Xem báo giá" })).not.toBeInTheDocument();
      view.unmount();
    }
  });
});

describe("deleting a returned draft with an open quote request (item 44)", () => {
  const { returned, draft } = MOCK_DESIGN_IDS;
  const open = {
    id: "7d51f000-0000-4000-8000-0000000000a9",
    designId: returned,
    designName: "Ly",
    designStatus: "DRAFT",
    returnReason: "Logo bị mờ",
    cartons: 10,
    status: "OPEN",
    requestedAt: "2026-11-01T00:00:00Z",
  };

  it("warns that the open request closes", async () => {
    registerMockRoute("GET", "/designs/:id/quote-requests", () => ({
      status: 200,
      data: { success: true, data: [open] },
      headers: {},
    }));
    renderWithProviders(
      <DeleteDesignDialog design={await getDesign(returned)} onClose={() => {}} />,
    );
    const dialog = await screen.findByRole("dialog");
    expect(
      await within(dialog).findByText(
        "Xoá nháp sẽ đóng yêu cầu báo giá đang mở.",
        undefined,
        FIRST_READ,
      ),
    ).toBeInTheDocument();
  });

  it("says nothing for a plain draft", async () => {
    const { client } = renderWithProviders(
      <DeleteDesignDialog design={await getDesign(draft)} onClose={() => {}} />,
    );
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByText(/đóng yêu cầu báo giá/)).not.toBeInTheDocument();
    // No query was even made for the draft's requests.
    expect(client.getQueryState(designKeys.quoteRequests(draft))?.fetchStatus ?? "idle").toBe(
      "idle",
    );
  });
});

describe("the approved design's SKU (item 18, BE-2)", () => {
  it("shows SKU riêng in the studio banner from the design itself, at once (nothing read for it)", async () => {
    const approved = await getDesign(MOCK_DESIGN_IDS.approved);
    expect(approved.customerSku).toMatch(/-KH0010-/);
    renderWithProviders(<StatusBanner design={approved} />);
    expect(screen.getByText(/SKU riêng/)).toBeInTheDocument();
    expect(screen.getByText(approved.customerSku!)).toHaveClass("font-mono");
  });

  it("shows it on the approved card from the list row, with no snapshot read", async () => {
    const backend = await designBackend();
    const page = await listDesigns({ page: 1, size: 20 });
    const approved = page.items.find((d) => d.id === MOCK_DESIGN_IDS.approved)!;
    const others = page.items.filter((d) => d.status !== "APPROVED");

    renderWithProviders(
      <>
        <DesignCard design={approved} />
        {others.map((d) => (
          <DesignCard key={d.id} design={d} />
        ))}
      </>,
    );

    expect(screen.getAllByText(/SKU riêng/)).toHaveLength(1);
    expect(screen.getByText(approved.customerSku!)).toBeInTheDocument();
    const reads = backend.get.mock.calls.filter(([url]) => String(url).endsWith("/snapshot"));
    expect(reads).toHaveLength(0);
  });

  it("says nothing of a SKU on a design that is not approved", async () => {
    const pending = await getDesign(MOCK_DESIGN_IDS.pending);
    expect(pending.customerSku).toBeNull();
    renderWithProviders(<StatusBanner design={pending} />);
    expect(await screen.findByText(/Đang chờ duyệt — gửi lúc/)).toBeInTheDocument();
    expect(screen.queryByText(/SKU riêng/)).toBeNull();
  });
});

describe("the colour note (item 43)", () => {
  it("shows once above the design list, not on every card", async () => {
    const approved = await getDesign(MOCK_DESIGN_IDS.approved);
    const list = {
      data: {
        items: [approved, { ...approved, id: "second" }],
        page: 1,
        totalPages: 1,
        totalElements: 2,
        hasPrevious: false,
        hasNext: false,
      },
      isPending: false,
      isPaused: false,
      isFetching: false,
      isPlaceholderData: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as Parameters<typeof DesignListBody>[0]["list"];
    renderWithProviders(
      <DesignListBody
        list={list}
        allTab
        page={1}
        revision={{
          revise: vi.fn(),
          revisingId: undefined,
          busy: false,
          error: null,
          clearError: vi.fn(),
        }}
        onDelete={vi.fn()}
        onClone={vi.fn()}
        onShowAll={vi.fn()}
        onFirstPage={vi.fn()}
        onPageChange={vi.fn()}
      />,
    );
    expect(await screen.findAllByText(COLOR_DISCLAIMER)).toHaveLength(1);
  });
});
