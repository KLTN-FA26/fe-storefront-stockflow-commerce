import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/error";
import { MOCK_BLOCKED_SKU } from "@/lib/api/mock-fixtures/design-print-configs";
import { renderWithProviders, signIn, signOut } from "@/test/render";

import { NewDesignScreen } from "../components/new-design-screen";
import { designBackend } from "./design-backend";

// The mock adapter adds latency per request; give multi-request flows headroom under load.
const WAIT = { timeout: 5000 };

const env = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: env.replace, push: vi.fn() }),
}));
// Mock mode counts every caller as signed in; the real session is what these tests drive.
vi.mock("@/providers/app-providers", () => ({ useIsMock: () => false }));

beforeEach(() => {
  env.replace.mockReset();
  signIn();
});
afterEach(() => {
  vi.restoreAllMocks();
  signOut();
});

const CUP = "ly-giay-2-lop-12oz";
const CUP_SKU = "CUP-PAPER-12OZ-WHT";
const NAME = "Ly giấy 2 lớp 12oz · CUP-PAPER-12OZ-WHT";

describe("NewDesignScreen", () => {
  it("creates the design named after the product and variant, and opens its studio", async () => {
    const { post } = await designBackend();
    renderWithProviders(<NewDesignScreen product={CUP} sku={CUP_SKU} />);

    await waitFor(
      () => expect(env.replace).toHaveBeenCalledWith(expect.stringMatching(/^\/design\/.+/)),
      WAIT,
    );
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith("/designs", {
      productSlug: CUP,
      sku: CUP_SKU,
      name: NAME,
    });
    expect(env.replace).toHaveBeenCalledTimes(1);
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
    expect(screen.getByRole("link", { name: "Chat với Sale" })).toHaveAttribute("href", "/chat");
    expect(post).not.toHaveBeenCalled();
  });

  it("says a blocked variant takes no design either", async () => {
    const { post } = await designBackend();
    renderWithProviders(<NewDesignScreen product="ly-giay-kraft-16oz" sku={MOCK_BLOCKED_SKU} />);

    expect(await screen.findByText(/không còn nhận thiết kế/, undefined, WAIT)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Chat với Sale" })).toBeInTheDocument();
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

    await userEvent.click(await screen.findByRole("button", { name: /Thử lại/ }, WAIT));
    await waitFor(() => expect(env.replace).toHaveBeenCalledTimes(1), WAIT);
    expect(post).toHaveBeenCalledTimes(2);
  });
});
