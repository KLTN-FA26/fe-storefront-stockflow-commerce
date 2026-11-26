import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/error";
import { seedMockCatalog } from "@/lib/api/mock-fixtures/catalog";
import { MOCK_BLOCKED_SKU, printConfigFor } from "@/lib/api/mock-fixtures/design-print-configs";
import { renderWithProviders, signIn, signOut } from "@/test/render";

import { createProject, getDesign } from "../api";

import { NewDesignScreen } from "../components/new-design-screen";
import { designKeys } from "../queries";
import { designBackend } from "./design-backend";

// The mock adapter adds latency per request; give multi-request flows headroom under load.
const WAIT = { timeout: 5000 };

const env = vi.hoisted(() => ({ replace: vi.fn(), search: new URLSearchParams() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: env.replace, push: vi.fn() }),
  useSearchParams: () => env.search,
}));
// Mock mode counts every caller as signed in; the real session is what these tests drive.
vi.mock("@/providers/app-providers", () => ({
  useIsMock: () => false,
  useIsDesignMock: () => false,
}));

beforeEach(() => {
  env.replace.mockReset();
  env.search = new URLSearchParams();
  window.sessionStorage.clear();
  signIn();
});
afterEach(() => {
  vi.restoreAllMocks();
  signOut();
});

const CUP = "ly-giay-2-lop-12oz";
const CUP_SKU = "CUP-PAPER-12OZ-WHT";
const NAME = "Ly giấy 2 lớp 12oz · CUP-PAPER-12OZ-WHT";
// What the BE wants beside the slug and SKU: the product's id and the template's code, read from
// the product's customization (F-12).
const CUP_PRODUCT_ID = seedMockCatalog().find((product) => product.slug === CUP)!.productId;
const CUP_TEMPLATE = printConfigFor(CUP, CUP_SKU)!.template.code;
const KEYED = { headers: { "Idempotency-Key": expect.any(String) } };
/** The Idempotency-Key of the n-th create the backend spy saw. */
const keyOf = (post: { mock: { calls: unknown[][] } }, n: number) =>
  (post.mock.calls[n]?.[2] as { headers: Record<string, string> }).headers["Idempotency-Key"];

describe("NewDesignScreen", () => {
  it("creates the design named after the product and variant, and opens its studio", async () => {
    const { post } = await designBackend();
    renderWithProviders(<NewDesignScreen product={CUP} sku={CUP_SKU} />);

    await waitFor(
      () => expect(env.replace).toHaveBeenCalledWith(expect.stringMatching(/^\/design\/.+/)),
      WAIT,
    );
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith(
      "/designs/mine",
      {
        productId: CUP_PRODUCT_ID,
        sku: CUP_SKU,
        templateCode: CUP_TEMPLATE,
        name: NAME,
      },
      KEYED,
    );
    expect(env.replace).toHaveBeenCalledTimes(1);
  });

  it("creates the design inside the project named by ?project=", async () => {
    const { post } = await designBackend();
    const project = await createProject({ name: "Bộ ly" });
    env.search = new URLSearchParams({ project: project.id });
    renderWithProviders(<NewDesignScreen product={CUP} sku={CUP_SKU} />);

    await waitFor(() => expect(env.replace).toHaveBeenCalledTimes(1), WAIT);
    expect(post).toHaveBeenCalledWith(
      "/designs/mine",
      {
        productId: CUP_PRODUCT_ID,
        sku: CUP_SKU,
        templateCode: CUP_TEMPLATE,
        name: NAME,
        projectId: project.id,
      },
      KEYED,
    );
    const opened = env.replace.mock.calls[0]?.[0] as string;
    const created = await getDesign(opened.replace("/design/", ""));
    expect(created.project?.id).toBe(project.id);
  });

  it("brings a visitor back to the link with the project in it", async () => {
    signOut();
    await designBackend();
    env.search = new URLSearchParams({ project: "p-1" });
    renderWithProviders(<NewDesignScreen product={CUP} sku={CUP_SKU} />);
    const next = encodeURIComponent(`/design/new?product=${CUP}&sku=${CUP_SKU}&project=p-1`);
    expect(await screen.findByRole("link", { name: "Đăng nhập" }, WAIT)).toHaveAttribute(
      "href",
      `/login?next=${next}`,
    );
  });

  it("creates one design when React runs the effects twice (StrictMode)", async () => {
    const { post } = await designBackend();
    renderWithProviders(
      <StrictMode>
        <NewDesignScreen product={CUP} sku={CUP_SKU} />
      </StrictMode>,
    );

    await waitFor(() => expect(env.replace).toHaveBeenCalledTimes(1), WAIT);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it("asks a visitor to sign in, brings them back, and creates nothing", async () => {
    signOut();
    const { post, get } = await designBackend();
    renderWithProviders(<NewDesignScreen product={CUP} sku={CUP_SKU} />);

    expect(
      await screen.findByText("Đăng nhập để bắt đầu thiết kế", undefined, WAIT),
    ).toBeInTheDocument();
    const next = encodeURIComponent(`/design/new?product=${CUP}&sku=${CUP_SKU}`);
    expect(screen.getByRole("link", { name: "Đăng nhập" })).toHaveAttribute(
      "href",
      `/login?next=${next}`,
    );
    expect(get).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });

  it("says a variant without a print configuration takes no design, and offers Sales", async () => {
    const { post } = await designBackend();
    renderWithProviders(<NewDesignScreen product="tui-giay-kraft" sku="BAG-KRAFT-L" />);

    expect(
      await screen.findByText("Quy cách này chưa nhận thiết kế.", undefined, WAIT),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Chat với Sale" })).toHaveAttribute(
      "href",
      "/chat/new",
    );
    expect(post).not.toHaveBeenCalled();
  });

  it("says a blocked variant takes no design either", async () => {
    const { post } = await designBackend();
    renderWithProviders(<NewDesignScreen product="ly-giay-kraft-16oz" sku={MOCK_BLOCKED_SKU} />);

    // The BE lists no blocked variant (F-22): it reads as one without a template.
    expect(
      await screen.findByText("Quy cách này chưa nhận thiết kế.", undefined, WAIT),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Chat với Sale" })).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it("says a variant of a product that is no longer published takes no design: it is not listed either (F-22)", async () => {
    const { post } = await designBackend({
      printConfigFor: (slug, sku) => {
        const config = printConfigFor(slug, sku);
        return config && { ...config, product: { ...config.product, status: "ARCHIVED" } };
      },
    });
    renderWithProviders(<NewDesignScreen product={CUP} sku={CUP_SKU} />);

    expect(
      await screen.findByText("Quy cách này chưa nhận thiết kế.", undefined, WAIT),
    ).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it("stops at 50 drafts with a link to the designs of the customer", async () => {
    const { store, post } = await designBackend();
    for (let i = 0; i < 48; i += 1) {
      await store.create({ productSlug: CUP, sku: CUP_SKU, name: `Ly ${i}` });
    }
    renderWithProviders(<NewDesignScreen product={CUP} sku={CUP_SKU} />);

    expect(await screen.findByText("Bạn đã có 50 bản nháp", undefined, WAIT)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Thiết kế của tôi" })).toHaveAttribute(
      "href",
      "/design",
    );
    expect(post).not.toHaveBeenCalled();
    expect(env.replace).not.toHaveBeenCalled();
  });

  it("does not flash the limit screen when the create itself makes the 50th draft", async () => {
    const { store } = await designBackend();
    for (let i = 0; i < 47; i += 1) {
      await store.create({ productSlug: CUP, sku: CUP_SKU, name: `Ly ${i}` });
    }
    renderWithProviders(<NewDesignScreen product={CUP} sku={CUP_SKU} />);

    await waitFor(() => expect(env.replace).toHaveBeenCalledTimes(1), WAIT);
    expect(screen.queryByText("Bạn đã có 50 bản nháp")).not.toBeInTheDocument();
  });

  it("shows why the BE refused, and retries on request", async () => {
    const { post } = await designBackend();
    post.mockRejectedValueOnce(new ApiError(500, "SERVER_ERROR", "boom"));
    renderWithProviders(<NewDesignScreen product={CUP} sku={CUP_SKU} />);

    const retry = await screen.findByRole("button", { name: /Thử lại/ }, WAIT);
    expect(screen.getByText("Không bắt đầu được thiết kế")).toBeInTheDocument();
    expect(
      screen.getByText("Hệ thống đang gặp sự cố. Vui lòng thử lại sau ít phút."),
    ).toBeInTheDocument();
    await userEvent.click(retry);
    await waitFor(() => expect(env.replace).toHaveBeenCalledTimes(1), WAIT);
    expect(post).toHaveBeenCalledTimes(2);
  });

  it("keeps its screen when a background re-read fails while it has the answer (L10)", async () => {
    const { store, get } = await designBackend();
    for (let i = 0; i < 48; i += 1) {
      await store.create({ productSlug: CUP, sku: CUP_SKU, name: `Ly ${i}` });
    }
    const { client } = renderWithProviders(<NewDesignScreen product={CUP} sku={CUP_SKU} />);
    expect(await screen.findByText("Bạn đã có 50 bản nháp", undefined, WAIT)).toBeInTheDocument();

    // A refusal is not retried by itself: the re-read fails at once.
    get.mockRejectedValueOnce(new ApiError(403, "FORBIDDEN", "x"));
    await act(() => client.refetchQueries({ queryKey: designKeys.draftCount() }));

    expect(client.getQueryState(designKeys.draftCount())?.status).toBe("error");
    expect(screen.getByText("Bạn đã có 50 bản nháp")).toBeInTheDocument();
    expect(screen.queryByText("Không bắt đầu được thiết kế")).not.toBeInTheDocument();
  });

  it("reloading the launcher before it redirects reuses the Idempotency-Key", async () => {
    const { post } = await designBackend();
    // The first load's create never answers (the page is reloaded meanwhile).
    post.mockImplementationOnce(() => new Promise(() => undefined));
    const first = renderWithProviders(<NewDesignScreen product={CUP} sku={CUP_SKU} />);
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1), WAIT);
    first.unmount();

    renderWithProviders(<NewDesignScreen product={CUP} sku={CUP_SKU} />);
    await waitFor(() => expect(post).toHaveBeenCalledTimes(2), WAIT);

    expect(keyOf(post, 1)).toBe(keyOf(post, 0));
  });

  it("a new visit after success uses a new key", async () => {
    const { post } = await designBackend();
    const first = renderWithProviders(<NewDesignScreen product={CUP} sku={CUP_SKU} />);
    await waitFor(() => expect(env.replace).toHaveBeenCalledTimes(1), WAIT);
    first.unmount();

    renderWithProviders(<NewDesignScreen product={CUP} sku={CUP_SKU} />);
    await waitFor(() => expect(post).toHaveBeenCalledTimes(2), WAIT);

    expect(keyOf(post, 1)).not.toBe(keyOf(post, 0));
  });

  it("tries again with the same key while the BE still runs the first request (409)", async () => {
    const { post } = await designBackend();
    const busy = new ApiError(
      409,
      "IDEMPOTENT_REQUEST_IN_PROGRESS",
      "busy",
      undefined,
      undefined,
      undefined,
      0,
    );
    post.mockRejectedValueOnce(busy);
    renderWithProviders(<NewDesignScreen product={CUP} sku={CUP_SKU} />);

    await waitFor(() => expect(env.replace).toHaveBeenCalledTimes(1), WAIT);
    expect(post).toHaveBeenCalledTimes(2);
    expect(keyOf(post, 1)).toBe(keyOf(post, 0));
    expect(screen.queryByText("Không bắt đầu được thiết kế")).not.toBeInTheDocument();
  });

  it("leaving the launcher while it waits to try again sends no second create (C10)", async () => {
    const { post } = await designBackend();
    const busy = new ApiError(
      409,
      "IDEMPOTENT_REQUEST_IN_PROGRESS",
      "busy",
      undefined,
      undefined,
      undefined,
      1,
    );
    post.mockRejectedValueOnce(busy);
    const view = renderWithProviders(<NewDesignScreen product={CUP} sku={CUP_SKU} />);
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1), WAIT);
    const keyBefore = keyOf(post, 0);
    view.unmount();
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(post).toHaveBeenCalledTimes(1);
    // The first request may still make the draft on the BE: the key stays, so coming back replays it.
    const kept = Object.keys(window.sessionStorage)
      .filter((k) => k.startsWith("sf.design.create-key:"))
      .map((k) => window.sessionStorage.getItem(k));
    expect(kept).toContain(keyBefore);
    renderWithProviders(<NewDesignScreen product={CUP} sku={CUP_SKU} />);
    await waitFor(() => expect(post).toHaveBeenCalledTimes(2), WAIT);
    expect(keyOf(post, 1)).toBe(keyBefore);
  });

  it("a refusal the BE stores for the key is not retried with that key", async () => {
    const { post } = await designBackend();
    post.mockRejectedValueOnce(new ApiError(422, "IDEMPOTENCY_KEY_REUSED", "x"));
    renderWithProviders(<NewDesignScreen product={CUP} sku={CUP_SKU} />);

    await userEvent.click(await screen.findByRole("button", { name: /Thử lại/ }, WAIT));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(2), WAIT);

    expect(keyOf(post, 1)).not.toBe(keyOf(post, 0));
  });

  it("does not open the studio once the customer has left the launcher (L12)", async () => {
    const { post } = await designBackend();
    const { client, unmount } = renderWithProviders(
      <NewDesignScreen product={CUP} sku={CUP_SKU} />,
    );
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1), WAIT);

    unmount();
    await waitFor(
      () =>
        expect(
          client
            .getMutationCache()
            .getAll()
            .map((m) => m.state.status),
        ).toEqual(["success"]),
      WAIT,
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(env.replace).not.toHaveBeenCalled();
  });
});
