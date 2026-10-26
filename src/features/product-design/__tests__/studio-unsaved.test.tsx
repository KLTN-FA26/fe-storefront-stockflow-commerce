import type { QueryClient } from "@tanstack/react-query";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { STORE_ROUTES } from "@/constants";
import { seedMockCatalog } from "@/lib/api/mock-fixtures/catalog";
import type { MockDesignStudio } from "@/lib/api/mock-fixtures/designs";
import { settle } from "@/test/fake-backend";
import { renderWithProviders, signIn, signOut } from "@/test/render";

import { DesignStudio } from "../components/studio/design-studio";
import type { StudioServices } from "../components/studio/studio-context";
import { unsavedDraftKey } from "../components/studio/unsaved-draft";
import { setBackground } from "../engine";
import { fakeDesignBackend, mockStudio } from "./design-backend";
import { TEST_FONTS } from "./fixtures";

const env = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: env.push, replace: vi.fn() }),
}));
vi.mock("@/providers/app-providers", () => ({ useIsMock: () => true }));

// The studio is rendered whole and autosave's real 1.5 s wait is waited out.
vi.setConfig({ testTimeout: 15_000 });

let online = true;
beforeEach(() => {
  online = true;
  env.push.mockReset();
  signIn();
  vi.spyOn(navigator, "onLine", "get").mockImplementation(() => online);
  // jsdom has no canvas: `getContext` logs "not implemented" before answering null (no 2D, no WebGL).
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(null, { status: 404 })),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.localStorage.clear();
  signOut();
});

/** A fresh 12oz cup draft (P1): an empty document on the body. */
async function draftCup(studio: MockDesignStudio) {
  const product = seedMockCatalog().find((p) => p.slug === "ly-giay-2-lop-12oz");
  const { data } = settle(
    await studio.create({
      productId: product!.productId,
      sku: "CUP-PAPER-12OZ-WHT",
      templateCode: "CUP12-BODY",
      name: "Ly thử",
    }),
  );
  return (data as { id: string }).id;
}

/** Renders the studio; resolves once it is laid out (a dialog may hide it), with its services. */
async function openStudio(designId: string) {
  const seen: { current?: StudioServices; client?: QueryClient } = {};
  const view = renderWithProviders(
    <DesignStudio
      designId={designId}
      fonts={TEST_FONTS}
      onServices={(services) => {
        seen.current = services;
      }}
    />,
  );
  await waitFor(() => expect(seen.current).toBeDefined());
  return { ...view, seen };
}

const paintBody = (services: StudioServices, color: `#${string}`) =>
  act(() => services.editor.apply((doc) => setBackground(doc, "BODY", { kind: "color", color })));

const storedDraft = (id: string) => {
  const raw = window.localStorage.getItem(unsavedDraftKey(id));
  return raw === null ? null : (JSON.parse(raw) as { baseVersion: number; document: unknown });
};
const red = { surfaces: { BODY: { background: { kind: "color", color: "#FF0000" } } } };
const SAVED = /^Đã lưu lúc \d{2}:\d{2}$/;

describe("edits that are not stored yet", () => {
  it("keeps them in the browser when the studio is left offline, and offers them back", async () => {
    const studio = mockStudio();
    const { put } = fakeDesignBackend(studio);
    const id = await draftCup(studio);
    const first = await openStudio(id);

    online = false;
    paintBody(first.seen.current!, "#FF0000");
    expect(
      await screen.findByText("Mất kết nối – sẽ lưu khi có mạng", undefined, { timeout: 4000 }),
    ).toBeInTheDocument();
    first.unmount(); // left inside the app: no beforeunload
    expect(storedDraft(id)).toMatchObject({ baseVersion: 0, document: red });
    expect(put).not.toHaveBeenCalled();

    online = true;
    const second = await openStudio(id);
    const offer = await screen.findByRole("dialog", { name: "Có thay đổi chưa được lưu" });
    await userEvent.click(within(offer).getByRole("button", { name: "Khôi phục bản chưa lưu" }));
    expect(second.seen.current!.editor.store.getState().document).toMatchObject(red);
    expect(await screen.findByText(SAVED, undefined, { timeout: 4000 })).toBeInTheDocument();
    expect(settle(studio.getDocument(id)).data).toMatchObject({ document: red });
    expect(storedDraft(id)).toBeNull();
  });

  it("drops the kept edits on Bỏ qua and opens the stored document", async () => {
    const studio = mockStudio();
    fakeDesignBackend(studio);
    const id = await draftCup(studio);
    const first = await openStudio(id);
    online = false;
    paintBody(first.seen.current!, "#FF0000");
    await screen.findByText("Mất kết nối – sẽ lưu khi có mạng", undefined, { timeout: 4000 });
    first.unmount();

    online = true;
    const second = await openStudio(id);
    const offer = await screen.findByRole("dialog", { name: "Có thay đổi chưa được lưu" });
    await userEvent.click(within(offer).getByRole("button", { name: "Bỏ qua" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(second.seen.current!.editor.store.getState().document.surfaces.BODY?.background).toEqual(
      { kind: "none" },
    );
    expect(storedDraft(id)).toBeNull();
  });

  it("does not offer edits made on a stored document that has changed since", async () => {
    const studio = mockStudio();
    fakeDesignBackend(studio);
    const id = await draftCup(studio);
    window.localStorage.setItem(
      unsavedDraftKey(id),
      JSON.stringify({
        baseVersion: 7,
        baseChecksum: "0".repeat(64),
        savedAt: Date.now(),
        document: {
          schemaVersion: 1,
          templateCode: "CUP12-BODY",
          sku: "CUP-PAPER-12OZ-WHT",
          surfaces: {},
        },
      }),
    );
    await openStudio(id);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(storedDraft(id)).toBeNull();
  });

  it("forgets the kept edits once autosave has stored them", async () => {
    const studio = mockStudio();
    fakeDesignBackend(studio);
    const id = await draftCup(studio);
    const { seen } = await openStudio(id);
    online = false;
    paintBody(seen.current!, "#FF0000");
    await screen.findByText("Mất kết nối – sẽ lưu khi có mạng", undefined, { timeout: 4000 });
    await waitFor(() => expect(storedDraft(id)).toMatchObject({ document: red }));

    online = true;
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    expect(await screen.findByText(SAVED, undefined, { timeout: 4000 })).toBeInTheDocument();
    expect(storedDraft(id)).toBeNull();
  });

  it("asks before the back link leaves while an edit is unsaved", async () => {
    const user = userEvent.setup();
    const studio = mockStudio();
    fakeDesignBackend(studio);
    const { seen } = await openStudio(await draftCup(studio));
    const back = screen.getByRole("link", { name: "Thiết kế của tôi" });

    paintBody(seen.current!, "#FF0000"); // pending: inside autosave's 1.5 s wait
    await user.click(back);
    const ask = await screen.findByRole("dialog", { name: "Thay đổi chưa được lưu" });
    expect(within(ask).getByRole("button", { name: "Tải bản sao JSON" })).toBeInTheDocument();
    await user.click(within(ask).getByRole("button", { name: "Ở lại" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(env.push).not.toHaveBeenCalled();

    await user.click(back);
    await user.click(
      within(await screen.findByRole("dialog", { name: "Thay đổi chưa được lưu" })).getByRole(
        "button",
        { name: "Rời đi" },
      ),
    );
    expect(env.push).toHaveBeenCalledWith(STORE_ROUTES.design.list);
  });

  it("asks the browser to confirm a page leave while an edit is unsaved", async () => {
    const studio = mockStudio();
    fakeDesignBackend(studio);
    const { seen } = await openStudio(await draftCup(studio));
    paintBody(seen.current!, "#FF0000");

    // jsdom has no BeforeUnloadEvent: a cancelable event whose `returnValue` a handler can set.
    const leave = new Event("beforeunload", { cancelable: true }) as BeforeUnloadEvent;
    Object.defineProperty(leave, "returnValue", { value: undefined, writable: true });
    window.dispatchEvent(leave);
    expect(leave.defaultPrevented).toBe(true);
    expect(leave.returnValue).toBeTruthy();
  });
});
