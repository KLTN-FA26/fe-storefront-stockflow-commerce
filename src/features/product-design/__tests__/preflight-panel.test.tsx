import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { settle } from "@/test/fake-backend";
import { renderWithProviders, signIn, signOut } from "@/test/render";

import { DesignStudio } from "../components/studio/design-studio";
import type { StudioServices } from "../components/studio/studio-context";
import { emptyDocument, type DesignDocument } from "../engine";
import { bagM, imageEl, pngBytes, textEl } from "../engine/__tests__/fixtures";
import { designBackend, draftIn, STUDIO_PRODUCTS } from "./design-backend";
import { TEST_FONTS } from "./fixtures";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

// The whole studio over the design mock (~0.2 s a request).
vi.setConfig({ testTimeout: 20_000 });

beforeEach(() => {
  signIn();
  // jsdom has no canvas: `getContext` logs "not implemented" before answering null (no 2D, no WebGL).
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  Element.prototype.scrollIntoView = vi.fn();
  // Every image link serves a file, and a decoder reads it: the design's images load.
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("png")),
  );
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(async () => ({ width: 300, height: 200, close: () => undefined })),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  signOut();
});

/** Renders the studio of `designId`; resolves once it is laid out, with its latest services. */
async function openStudio(designId: string) {
  const seen: { current?: StudioServices } = {};
  renderWithProviders(
    <DesignStudio
      designId={designId}
      fonts={TEST_FONTS}
      onServices={(services) => {
        seen.current = services;
      }}
    />,
  );
  await waitFor(() => expect(seen.current).toBeDefined(), { timeout: 4000 });
  return seen;
}

/** The "Kiểm tra" panel's report, once it has settled on `summary`. */
async function checkPanel(summary: "Đạt" | "Không đạt") {
  await userEvent.click(await screen.findByRole("button", { name: "Kiểm tra" }));
  const panel = screen.getByRole("region", { name: "Kết quả kiểm tra" });
  await within(panel).findByText(summary);
  return within(panel);
}

/** A kraft bag draft whose faces hold what `fill` puts there. */
function bagDraft(fill: (document: DesignDocument) => void) {
  return async (store: Awaited<ReturnType<typeof designBackend>>["store"]) => {
    const document = emptyDocument(bagM);
    fill(document);
    return draftIn(store, STUDIO_PRODUCTS.bag, document);
  };
}

describe("PreflightPanel", () => {
  it("says Không đạt and locates an issue on click: its face, its element", async () => {
    const user = userEvent.setup();
    const { store } = await designBackend();
    // A 300 × 200 px picture over 60 mm: 127 DPI, under the print configuration's 300.
    const id = await draftIn(store, STUDIO_PRODUCTS.bag);
    const file = new File([pngBytes(300, 200)], "low.png", { type: "image/png" });
    const { assetId } = settle(await store.uploadAsset(id, file, "low.png", "low-key")).data as {
      assetId: string;
    };
    const document = emptyDocument(bagM);
    document.surfaces.BACK = {
      background: { kind: "none" },
      elements: [imageEl("low", { assetId, naturalWidthPx: 300, naturalHeightPx: 200 })],
    };
    const { version } = settle(await store.get(id)).data as { version: number };
    settle(await store.putDocument(id, { version, document }));
    const seen = await openStudio(id);

    const panel = await checkPanel("Không đạt");
    expect(panel.getByRole("heading", { name: "Mặt sau" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Mặt trước" })).toBeChecked();

    await user.click(panel.getByRole("button", { name: /127 DPI/ }));

    expect(screen.getByRole("radio", { name: "Mặt sau" })).toBeChecked();
    expect(seen.current!.editor.store.getState()).toMatchObject({
      activeSurface: "BACK",
      selectedId: "low",
    });
  });

  it("says Đạt for a design without a failure, its print notes under Lưu ý khi in", async () => {
    const { store } = await designBackend();
    const white = textEl("white", {
      content: "Tiệm Bánh Hoa",
      color: "#FFFFFF",
      placement: { u: 130, v: 140, rotationDeg: 0, scale: 1 },
    });
    const id = await bagDraft((document) => {
      document.surfaces.FRONT = { background: { kind: "none" }, elements: [white] };
    })(store);
    await openStudio(id);

    const panel = await checkPanel("Đạt");
    expect(panel.getByRole("heading", { name: "Lưu ý khi in" })).toBeInTheDocument();
    expect(panel.getByText("Giấy kraft không in được màu trắng.")).toBeInTheDocument();
    expect(panel.queryByRole("heading", { name: "Toàn thiết kế" })).not.toBeInTheDocument();
  });

  it("lists a failure of the whole design under Toàn thiết kế, with nowhere to locate", async () => {
    const { store } = await designBackend();
    await openStudio(await draftIn(store, STUDIO_PRODUCTS.bag));

    const panel = await checkPanel("Không đạt");
    expect(panel.getByRole("heading", { name: "Toàn thiết kế" })).toBeInTheDocument();
    expect(panel.getByText("Thiết kế chưa có nội dung.")).toBeInTheDocument();
    expect(panel.queryByRole("button", { name: /Thiết kế chưa có nội dung/ })).toBeNull();
  });
});
