import type { QueryClient } from "@tanstack/react-query";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { STORE_ROUTES } from "@/constants";
import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/error";
import type { DesignMockStore } from "@/lib/api/mock-fixtures/design-store";
import { settle } from "@/test/fake-backend";
import { renderWithProviders, signIn, signOut } from "@/test/render";

import { DesignStudio } from "../components/studio/design-studio";
import type { StudioServices } from "../components/studio/studio-context";
import { unsavedDraftKey } from "../components/studio/unsaved-draft";
import { emptyDocument, setBackground } from "../engine";
import { cup12oz } from "../engine/__tests__/fixtures";
import { designKeys } from "../queries";
import { designBackend, draftIn, STUDIO_PRODUCTS } from "./design-backend";
import { TEST_FONTS } from "./fixtures";

const env = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: env.push, replace: vi.fn() }),
}));

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

/** A fresh 12oz cup draft: an empty document on the body. */
const draftCup = (studio: DesignMockStore) =>
  draftIn(studio, STUDIO_PRODUCTS.cup, undefined, "Ly thử");

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
  await waitFor(() => expect(seen.current).toBeDefined(), { timeout: 4000 });
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
    const { store: studio, put } = await designBackend();
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
    expect(settle(await studio.getDocument(id)).data).toMatchObject({ document: red });
    expect(storedDraft(id)).toBeNull();
  });

  it("drops the kept edits on Bỏ qua and opens the stored document", async () => {
    const { store: studio } = await designBackend();
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
    const { store: studio } = await designBackend();
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
    const { store: studio } = await designBackend();
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
    const { store: studio } = await designBackend();
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
    const { store: studio } = await designBackend();
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

describe("autosave and the other writers of a design (R69)", () => {
  /** What another tab or device saves: a green body. */
  const elsewhere = () => {
    const document = emptyDocument(cup12oz);
    document.surfaces.BODY = { background: { kind: "color", color: "#00FF00" }, elements: [] };
    return document;
  };
  const CONFLICT = { name: "Thiết kế đã thay đổi ở nơi khác" } as const;
  const pastAutosave = () => act(() => new Promise((resolve) => setTimeout(resolve, 2000)));

  it("opens the conflict dialog when the design is read again after another tab saved, and saves nothing over it", async () => {
    const { store: studio, put } = await designBackend();
    const id = await draftCup(studio);
    const { seen, client } = await openStudio(id);
    settle(await studio.putDocument(id, { version: 0, document: elsewhere() }));

    // The window regains focus: the design is read again, at the other tab's version.
    await act(() => client.invalidateQueries({ queryKey: designKeys.detail(id), exact: true }));
    expect(await screen.findByRole("dialog", CONFLICT, { timeout: 4000 })).toBeInTheDocument();

    paintBody(seen.current!, "#FF0000");
    await pastAutosave();
    expect(put).not.toHaveBeenCalled();
    expect(settle(await studio.getDocument(id)).data).toMatchObject({ document: elsewhere() });
  });

  it("saves an edit over another tab's rename (a write that leaves the document as it was), without a dialog", async () => {
    const { store: studio, put } = await designBackend();
    const id = await draftCup(studio);
    const { seen } = await openStudio(id);
    // Renamed in another tab before this one read the design again: the version moved on to 1.
    settle(await studio.rename(id, { name: "Ly đổi tên", version: 0 }));

    paintBody(seen.current!, "#FF0000");

    expect(await screen.findByText(SAVED, undefined, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    // Refused at 0 (stale), the stored document is still this tab's: sent again at 1.
    expect(put.mock.calls.map(([, body]) => (body as { version: number }).version)).toEqual([0, 1]);
    expect(settle(await studio.getDocument(id)).data).toMatchObject({ document: red });
  });

  it("does not save over another device's document when the design was read after it", async () => {
    const realGet = api.get.bind(api);
    const { store: studio, get, put } = await designBackend();
    const id = await draftCup(studio);
    // The document is read before another device saves; the design after it (a newer version).
    const before = settle(await studio.getDocument(id));
    settle(await studio.putDocument(id, { version: 0, document: elsewhere() }));
    let stale = true;
    get.mockImplementation(async (url, config) => {
      if (stale && url === `/designs/${id}/document`) {
        stale = false;
        return before;
      }
      return realGet(url, config);
    });
    const { seen } = await openStudio(id);

    expect(await screen.findByRole("dialog", CONFLICT, { timeout: 4000 })).toBeInTheDocument();
    paintBody(seen.current!, "#FF0000");
    await pastAutosave();
    expect(put).not.toHaveBeenCalled();
    expect(settle(await studio.getDocument(id)).data).toMatchObject({ document: elsewhere() });
  });

  it("asks for the stored document again after a failed read, and still finds the other save", async () => {
    const realGet = api.get.bind(api);
    const { store: studio, get } = await designBackend();
    const id = await draftCup(studio);
    const { client } = await openStudio(id);
    settle(await studio.putDocument(id, { version: 0, document: elsewhere() }));
    // The read fails past the query's own two retries.
    let failures = 0;
    get.mockImplementation(async (url, config) => {
      if (failures < 3 && url === `/designs/${id}/document`) {
        failures += 1;
        throw new ApiError(503, "SERVICE_UNAVAILABLE", "Document service down");
      }
      return realGet(url, config);
    });

    await act(() => client.invalidateQueries({ queryKey: designKeys.detail(id), exact: true }));

    expect(await screen.findByRole("dialog", CONFLICT, { timeout: 12_000 })).toBeInTheDocument();
    expect(failures).toBe(3);
  }, 25_000);
});
