import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/error";
import type { DesignMockStore } from "@/lib/api/mock-fixtures/design-store";
import { settle } from "@/test/fake-backend";
import { pickDate } from "@/test/date-picker";
import { renderWithProviders, signIn, signOut } from "@/test/render";

import { listDesignQuoteRequests } from "../api";
import { DesignStudio } from "../components/studio/design-studio";
import type { ExportRenderer } from "../components/studio/export-renderer";
import type { StudioServices } from "../components/studio/studio-context";
import { emptyDocument, type DesignDocument, type DesignElement } from "../engine";
import { cup12oz, PNG_1x1, textEl } from "../engine/__tests__/fixtures";
import type { Design } from "../types";
import { designBackend, draftIn, STUDIO_PRODUCTS } from "./design-backend";
import { TEST_FONTS } from "./fixtures";

/** A day the picker offers (its years reach five ahead) and the "not in the past" rule allows. */
const FUTURE_DAY = `${new Date().getFullYear() + 1}-12-31`;

// The print file needs its colour profiles: jsdom serves no `public/` files.
vi.mock(
  "../components/studio/print-profiles",
  async () => (await import("./print-profiles-stub")).printProfilesStub,
);

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

// "Gửi duyệt và yêu cầu báo giá" (docs 12 §4.8.24) in the studio's submit dialog, over the design
// mock: the choice next to the plain submission, its fields checked before anything is drawn, the
// body of the request for review (`quoteRequest`), the BE's refusal of the request under its field
// (the files already sent are sent again as they are), and the notice with "Chat với Sale" at the end.
// The PDFs are stand-ins, as in `submit-dialog.test.tsx`.
vi.mock("../engine", async (importOriginal) => {
  const engine = await importOriginal<typeof import("../engine")>();
  const pdf = async () => new TextEncoder().encode("%PDF-1.7 stand-in");
  return { ...engine, buildPrintPdf: pdf, buildSheetPdf: pdf };
});

vi.setConfig({ testTimeout: 20_000 });
const SUBMISSION = { timeout: 5000 };

beforeEach(() => {
  signIn();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  Element.prototype.scrollIntoView = vi.fn();
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

const fakeRenderer = (): ExportRenderer => ({
  preview: vi.fn<ExportRenderer["preview"]>(async () => PNG_1x1),
  printSurface: vi.fn<ExportRenderer["printSurface"]>(async () => [{ png: PNG_1x1, heightPx: 1 }]),
  printVector: vi.fn<ExportRenderer["printVector"]>(async () => null),
  printSheetFace: vi.fn<ExportRenderer["printSheetFace"]>(async () => ({
    content: "",
    images: [],
    alphas: [],
    layers: [],
  })),
  printSlug: vi.fn<ExportRenderer["printSlug"]>(async () => PNG_1x1),
  designBrief: vi.fn<ExportRenderer["designBrief"]>(async () => [PNG_1x1]),
  release: vi.fn<ExportRenderer["release"]>(),
});

/** A 12oz cup draft that passes the preflight (version 1). */
function passingDraft(store: DesignMockStore) {
  const document: DesignDocument = emptyDocument(cup12oz);
  const text: DesignElement = textEl("text", {
    content: "Cà phê",
    placement: { u: 170, v: 55, rotationDeg: 0, scale: 1 },
  });
  document.surfaces.BODY = { background: { kind: "none" }, elements: [text] };
  return draftIn(store, STUDIO_PRODUCTS.cup, document);
}

async function openStudio(designId: string) {
  const seen: { current?: StudioServices } = {};
  renderWithProviders(
    <DesignStudio
      designId={designId}
      fonts={TEST_FONTS}
      exportRenderer={fakeRenderer()}
      onServices={(services) => {
        seen.current = services;
      }}
    />,
  );
  await waitFor(() => expect(seen.current).toBeDefined(), { timeout: 4000 });
  await act(() => new Promise((resolve) => setTimeout(resolve, 350)));
}

/** "Gửi duyệt" in the header, then the Pass confirmation with the preview drawn. */
async function openConfirm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Gửi duyệt" }));
  const dialog = await screen.findByRole("dialog", { name: "Gửi duyệt" });
  await within(dialog).findByRole("img", { name: "Ảnh xem trước thiết kế" });
  return dialog;
}

/** The client before any spy: what a stubbed `post` falls through to. */
const realPost = api.post.bind(api);

const reviewPosts = (post: { mock: { calls: unknown[][] } }, id: string) =>
  post.mock.calls.filter(([url]) => url === `/designs/${id}/technical-review-requests`);

describe("Gửi duyệt và yêu cầu báo giá", () => {
  it("is offered next to the plain submission; the plain one stays as it was", async () => {
    const user = userEvent.setup();
    const { store } = await designBackend();
    const id = await passingDraft(store);
    await openStudio(id);
    const dialog = await openConfirm(user);

    const plain = within(dialog).getByRole("radio", { name: /Chỉ gửi duyệt/ });
    expect(plain).toBeChecked();
    expect(
      within(dialog).getByRole("radio", { name: /Gửi duyệt và yêu cầu báo giá/ }),
    ).not.toBeChecked();
    // No quote fields until the customer asks for one.
    expect(within(dialog).queryByLabelText("Số thùng mong muốn")).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Gửi duyệt" })).toBeEnabled();
  });

  it("checks the cartons before drawing anything", async () => {
    const user = userEvent.setup();
    const { store, post } = await designBackend();
    const id = await passingDraft(store);
    await openStudio(id);
    const dialog = await openConfirm(user);

    await user.click(within(dialog).getByRole("radio", { name: /Gửi duyệt và yêu cầu báo giá/ }));
    await user.click(within(dialog).getByRole("button", { name: "Gửi duyệt và yêu cầu báo giá" }));

    expect(await within(dialog).findByText("Nhập số thùng mong muốn.")).toBeInTheDocument();
    expect(post.mock.calls.filter(([url]) => String(url).includes("/artifacts"))).toEqual([]);
  });

  it("sends `quoteRequest` with the request for review and ends on the notice with Chat với Sale", async () => {
    const user = userEvent.setup();
    const { store, post } = await designBackend();
    const id = await passingDraft(store);
    await openStudio(id);
    const dialog = await openConfirm(user);

    await user.click(within(dialog).getByRole("radio", { name: /Gửi duyệt và yêu cầu báo giá/ }));
    await user.type(within(dialog).getByLabelText("Số thùng mong muốn"), "40");
    await pickDate(
      user,
      within(dialog).getByLabelText("Ngày giao mong muốn (không bắt buộc)"),
      FUTURE_DAY,
    );
    await user.click(within(dialog).getByRole("button", { name: "Gửi duyệt và yêu cầu báo giá" }));

    expect(
      await within(dialog).findByText(
        "Đã gửi yêu cầu, Sale sẽ liên hệ qua chat.",
        undefined,
        SUBMISSION,
      ),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: "Chat với Sale" })).toHaveAttribute(
      "href",
      `/chat/new?kind=DESIGN&id=${id}`,
    );
    const [[, body]] = reviewPosts(post, id) as [[string, unknown]];
    expect(body).toEqual({
      version: expect.any(Number),
      quoteRequest: { cartons: 40, desiredDeliveryDate: FUTURE_DAY },
    });
    expect((settle(await store.get(id)).data as Design).status).toBe("PENDING_REVIEW");
    expect(await listDesignQuoteRequests(id)).toEqual([
      expect.objectContaining({ cartons: 40, status: "OPEN", designStatus: "PENDING_REVIEW" }),
    ]);

    // The dialog stays until the customer closes it.
    await user.click(within(dialog).getByRole("button", { name: "Đóng" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("puts the BE's refusal of the request under its field; confirming again sends the same files", async () => {
    const user = userEvent.setup();
    const { store, post } = await designBackend();
    const id = await passingDraft(store);
    await openStudio(id);
    let refused = false;
    post.mockImplementation(((url: string, ...rest: unknown[]) => {
      if (String(url).endsWith("/technical-review-requests") && !refused) {
        refused = true;
        return Promise.reject(
          new ApiError(400, "VALIDATION_FAILED", "Dữ liệu không hợp lệ.", [
            {
              field: "quoteRequest.desiredDeliveryDate",
              message: "Ngày giao mong muốn phải từ hôm nay trở đi.",
              code: "FutureOrPresent",
            },
          ]),
        );
      }
      return (realPost as (...args: unknown[]) => Promise<unknown>)(url, ...rest);
    }) as typeof api.post);
    const dialog = await openConfirm(user);

    await user.click(within(dialog).getByRole("radio", { name: /Gửi duyệt và yêu cầu báo giá/ }));
    await user.type(within(dialog).getByLabelText("Số thùng mong muốn"), "40");
    await pickDate(
      user,
      within(dialog).getByLabelText("Ngày giao mong muốn (không bắt buộc)"),
      FUTURE_DAY,
    );
    await user.click(within(dialog).getByRole("button", { name: "Gửi duyệt và yêu cầu báo giá" }));

    const date = await within(dialog).findByLabelText(
      "Ngày giao mong muốn (không bắt buộc)",
      undefined,
      SUBMISSION,
    );
    await waitFor(() => expect(date).toHaveAttribute("aria-invalid", "true"), SUBMISSION);
    expect(
      within(dialog).getByText("Ngày giao mong muốn phải từ hôm nay trở đi."),
    ).toBeInTheDocument();
    expect((settle(await store.get(id)).data as Design).status).toBe("DRAFT");
    const uploads = () =>
      post.mock.calls.filter(([url]) => url === `/designs/${id}/artifacts`).length;
    const drawnOnce = uploads();

    // Without a date this time: the files are not drawn again, the request goes with the design.
    await user.click(date);
    await user.click(await screen.findByRole("button", { name: "Xoá ngày" }));
    await user.click(within(dialog).getByRole("button", { name: "Gửi duyệt và yêu cầu báo giá" }));
    expect(
      await within(dialog).findByText(
        "Đã gửi yêu cầu, Sale sẽ liên hệ qua chat.",
        undefined,
        SUBMISSION,
      ),
    ).toBeInTheDocument();
    expect(reviewPosts(post, id).at(-1)?.[1]).toEqual({
      version: expect.any(Number),
      quoteRequest: { cartons: 40 },
    });
    // The same three files again (idempotent replays), not a new drawing.
    expect(uploads()).toBe(drawnOnce + 3);
  });
});
