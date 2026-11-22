import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/error";
import { printConfigFor } from "@/lib/api/mock-fixtures/design-print-configs";
import { MOCK_DESIGN_IDS } from "@/lib/api/mock-fixtures/design-seed";
import { renderWithProviders, signIn, signOut } from "@/test/render";

import { cloneDesign, createDesign, getDesign, getDesignDocument } from "../api";
import { DesignCard } from "../components/design-card";
import { DesignListScreen } from "../components/design-list-screen";
import type { DesignableCatalogue } from "../components/new-design-dialog";
import { retargetDocument } from "../engine/document/retarget";
import { describeDesignError } from "../errors";
import { useCloneDesign } from "../mutations";
import { designKeys, projectKeys } from "../queries";
import { cloneDtoSchema } from "../project-dtos";
import { cloneDesignInputSchema } from "../schemas";
import { cupDocument, design, designDraftDto, ids } from "./fixtures";
import { designBackend } from "./design-backend";

const env = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: env.push }) }));

afterEach(() => {
  vi.restoreAllMocks();
  signOut();
});

const id = ids.design;
const document = cupDocument();

describe("clone schemas and API", () => {
  it("parses an answer with the draft and why it is in no project", () => {
    const answer = { design: designDraftDto({ id: ids.revision }), notInProject: "PROJECT_FULL" };
    expect(cloneDtoSchema.parse(answer).notInProject).toBe("PROJECT_FULL");
    expect(cloneDtoSchema.parse({ ...answer, notInProject: null }).notInProject).toBeNull();
    // The BE leaves the key out when the source had no project; a missing draft is a contract break.
    expect(cloneDtoSchema.parse({ design: answer.design }).notInProject).toBeUndefined();
    expect(() => cloneDtoSchema.parse({ notInProject: "PROJECT_FULL" })).toThrow();
  });

  it("needs a variant and a design document", () => {
    expect(cloneDesignInputSchema.safeParse({ variantSku: "  ", document }).success).toBe(false);
    expect(cloneDesignInputSchema.safeParse({ variantSku: "A", document: {} }).success).toBe(false);
    expect(cloneDesignInputSchema.parse({ variantSku: " A ", document }).variantSku).toBe("A");
  });

  it("posts the variant and the document and parses the answer", async () => {
    const post = vi.spyOn(api, "post").mockResolvedValueOnce({
      data: { design: designDraftDto({ id: ids.revision }), notInProject: null },
    });
    const result = await cloneDesign(id, { variantSku: "CUP-2", document }, "key-1");
    expect(post).toHaveBeenCalledWith(
      `/designs/${id}/clones`,
      { variantSku: "CUP-2", document },
      { headers: { "Idempotency-Key": "key-1" } },
    );
    expect(result.design.id).toBe(ids.revision);
    // The BE takes the target template from the document's `templateCode` (BE `DESIGN_CLONE_TARGET_INVALID`).
    const sent = post.mock.calls[0]![1] as { document: { templateCode: string } };
    expect(sent.document.templateCode).toBe(document.templateCode);
  });

  it("does not send a document the contract refuses", async () => {
    const post = vi.spyOn(api, "post");
    await expect(
      cloneDesign(id, { variantSku: "CUP-2", document: {} as typeof document }, "key-1"),
    ).rejects.toThrow();
    expect(post).not.toHaveBeenCalled();
  });

  it("words DESIGN_CLONE_TARGET_INVALID", () => {
    expect(describeDesignError(new ApiError(409, "DESIGN_CLONE_TARGET_INVALID", "x"))).toBe(
      "Không nhân bản được sang quy cách này. Hãy chọn quy cách khác.",
    );
  });
});

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { invalidate, wrapper };
}
const keysOf = (spy: ReturnType<typeof setup>["invalidate"]) =>
  spy.mock.calls.map(([filters]) => filters);

describe("useCloneDesign", () => {
  it("re-reads the lists, the draft count and the projects after a copy", async () => {
    vi.spyOn(api, "post").mockResolvedValueOnce({
      data: { design: designDraftDto({ id: ids.revision }), notInProject: null },
    });
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useCloneDesign(id), { wrapper });

    result.current.mutate({ variantSku: "CUP-2", document, idempotencyKey: "k" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(keysOf(invalidate)).toEqual([
      { queryKey: designKeys.lists() },
      { queryKey: designKeys.draftCount() },
      { queryKey: projectKeys.all },
    ]);
  });

  it("re-reads the source when it is gone", async () => {
    vi.spyOn(api, "post").mockRejectedValueOnce(new ApiError(404, "NOT_FOUND", "x"));
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useCloneDesign(id), { wrapper });

    result.current.mutate({ variantSku: "CUP-2", document, idempotencyKey: "k" });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(keysOf(invalidate)).toEqual([
      { queryKey: designKeys.detail(id), exact: true },
      { queryKey: designKeys.lists() },
    ]);
  });
});

describe("clone through the mock", () => {
  beforeEach(async () => {
    await designBackend();
  });

  it("is refused with DESIGN_CLONE_TARGET_INVALID for a variant of another product", async () => {
    const source = await createDesign({
      productSlug: "ly-giay-2-lop-8oz",
      sku: "CUP-PAPER-8OZ-WHT",
      name: "Ly",
    });
    // The 12 oz cup is another product, not another size of this one.
    await expect(
      cloneDesign(
        source.id,
        { variantSku: "CUP-PAPER-12OZ-WHT", document: { ...document, sku: "CUP-PAPER-12OZ-WHT" } },
        "key-x",
      ),
    ).rejects.toMatchObject({ status: 409, code: "DESIGN_CLONE_TARGET_INVALID" });
    expect(await getDesign(source.id)).toMatchObject({ id: source.id });
  });

  it("clones a seeded design to the other variant of its product and leaves the source as it was", async () => {
    // The returned seed is a cup of the 8 oz product, which has a second variant.
    const before = await getDesign(MOCK_DESIGN_IDS.returned);
    const record = await getDesignDocument(MOCK_DESIGN_IDS.returned);
    const template = (sku: string) => printConfigFor("ly-giay-2-lop-8oz", sku)!.template;
    const fitted = retargetDocument(
      record.document,
      template("CUP-PAPER-8OZ-WHT"),
      template("CUP-PAPER-8OZ-KRAFT"),
    );
    const result = await cloneDesign(
      MOCK_DESIGN_IDS.returned,
      { variantSku: "CUP-PAPER-8OZ-KRAFT", document: fitted.document },
      "key-y",
    );
    expect(result.design).toMatchObject({ status: "DRAFT", version: 0 });
    expect(result.design.variant.sku).toBe("CUP-PAPER-8OZ-KRAFT");
    expect(await getDesign(MOCK_DESIGN_IDS.returned)).toEqual(before);
  });
});

describe("the card and the list: Nhân bản sang cỡ khác", () => {
  it("shows the button only when the page can handle it, and reports the design", async () => {
    const onClone = vi.fn();
    const target = design({ name: "Ly sáng" });
    // With providers: every card now offers "Chat với Sale", which reads the permission list (Q7).
    const first = renderWithProviders(
      <DesignCard design={target} onDelete={vi.fn()} onRevise={vi.fn()} />,
    );
    expect(screen.queryByRole("button", { name: /sang cỡ khác/ })).not.toBeInTheDocument();
    first.unmount();

    renderWithProviders(
      <DesignCard design={target} onDelete={vi.fn()} onRevise={vi.fn()} onClone={onClone} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Nhân bản Ly sáng sang cỡ khác" }));
    expect(onClone).toHaveBeenCalledWith(target);
  });

  it("opens the dialog from the list for the card's design", async () => {
    signIn();
    await designBackend();
    const catalogue: DesignableCatalogue = {
      status: "ready",
      products: [],
      stale: false,
      more: null,
      onSearch: () => undefined,
      skusOf: async () => ["CUP-PAPER-8OZ-WHT", "CUP-PAPER-8OZ-KRAFT"],
    };
    renderWithProviders(<DesignListScreen catalogue={catalogue} />);

    const list = await screen.findByRole("list", { name: "Danh sách thiết kế" }, { timeout: 3000 });
    const heading = await within(list).findByRole("heading", { name: "Ly cà phê Sáng 8oz" });
    await userEvent.click(
      within(heading.closest("li") as HTMLElement).getByRole("button", {
        name: "Nhân bản Ly cà phê Sáng 8oz sang cỡ khác",
      }),
    );

    expect(
      await screen.findByRole("dialog", { name: "Nhân bản sang cỡ khác" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("radio", { name: "CUP-PAPER-8OZ-KRAFT" }, { timeout: 4000 }),
    ).toBeInTheDocument();
  });
});
