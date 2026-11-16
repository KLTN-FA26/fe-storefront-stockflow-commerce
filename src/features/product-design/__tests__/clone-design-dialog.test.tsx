import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/error";
import { printConfigFor, type PrintConfigRow } from "@/lib/api/mock-fixtures/design-print-configs";
import { renderWithProviders } from "@/test/render";

import { CloneDesignDialog } from "../components/clone-design-dialog";
import { addElement } from "../engine/document/commands";
import { emptyDocument } from "../engine/document/factory";
import { textEl } from "../engine/__tests__/fixtures";
import { archiveProject, createDesign, createProject, saveDesignDocument } from "../api";
import type { Design } from "../types";
import { designBackend } from "./design-backend";

const env = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: env.push }) }));

const WAIT = { timeout: 4000 };
const CUP = { productSlug: "ly-giay-2-lop-8oz", sku: "CUP-PAPER-8OZ-WHT" };
const BAG = { productSlug: "tui-giay-kraft", sku: "BAG-KRAFT-M" };
const SMALL_BAG = "BAG-KRAFT-S";
const BLOCKED_CUP = "CUP-PAPER-8OZ-BLOCKED";

/**
 * The mock catalogue has no second size of one product, so two are made up here: a small bag that
 * lacks the gusset faces, and a cup variant that no longer takes designs.
 */
function withMoreVariants(slug: string, sku: string): PrintConfigRow | null {
  if (slug === BAG.productSlug && sku === SMALL_BAG) {
    const base = printConfigFor(slug, BAG.sku)!;
    const printAreas = base.template.printAreas.filter(
      (a) => a.code === "FRONT" || a.code === "BACK",
    );
    return { ...base, sku, template: { ...base.template, sku, printAreas } };
  }
  if (slug === CUP.productSlug && sku === BLOCKED_CUP) {
    return { ...printConfigFor(slug, CUP.sku)!, sku, variantStatus: "BLOCKED" };
  }
  return printConfigFor(slug, sku);
}

let backend: Awaited<ReturnType<typeof designBackend>>;
beforeEach(async () => {
  env.push.mockReset();
  backend = await designBackend({ printConfigFor: withMoreVariants });
});
afterEach(() => vi.restoreAllMocks());

const skusOf = (skus: string[]) => vi.fn(async () => skus);

function show(design: Design, skus: string[], onOpenChange = vi.fn()) {
  return renderWithProviders(
    <CloneDesignDialog design={design} open onOpenChange={onOpenChange} skusOf={skusOf(skus)} />,
  );
}

const startOf = (config: { productSlug: string; sku: string }, extra = {}) =>
  createDesign({ ...config, name: "Ly sáng", ...extra });

const confirm = () => userEvent.click(screen.getByRole("button", { name: "Nhân bản" }));
const option = (sku: string) => screen.findByRole("radio", { name: sku }, WAIT);

describe("CloneDesignDialog", () => {
  it("offers only the other variants of the product that take designs", async () => {
    const design = await startOf(CUP);
    show(design, [CUP.sku, "CUP-PAPER-8OZ-KRAFT", BLOCKED_CUP, "CUP-PAPER-8OZ-UNKNOWN"]);

    expect(await option("CUP-PAPER-8OZ-KRAFT")).toBeInTheDocument();
    // Its own variant, one that is blocked and one without a print configuration are not offered.
    expect(screen.queryByRole("radio", { name: CUP.sku })).not.toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: BLOCKED_CUP })).not.toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "CUP-PAPER-8OZ-UNKNOWN" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nhân bản" })).toBeDisabled();
  });

  it("says so when the product has no other variant that takes designs", async () => {
    const design = await startOf(CUP);
    show(design, [CUP.sku, BLOCKED_CUP]);

    expect(
      await screen.findByText("Sản phẩm này chưa có quy cách khác nhận thiết kế.", undefined, WAIT),
    ).toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  });

  it("sends the re-fitted document to the clone endpoint and opens the studio of the copy", async () => {
    const { post } = backend;
    const design = await startOf(CUP);
    show(design, [CUP.sku, "CUP-PAPER-8OZ-KRAFT"]);

    await userEvent.click(await option("CUP-PAPER-8OZ-KRAFT"));
    await confirm();

    await waitFor(() => expect(env.push).toHaveBeenCalledTimes(1), WAIT);
    const call = post.mock.calls.find(([url]) => url === `/designs/${design.id}/clones`)!;
    expect(call[1]).toMatchObject({
      variantSku: "CUP-PAPER-8OZ-KRAFT",
      document: { sku: "CUP-PAPER-8OZ-KRAFT" },
    });
    const [path] = env.push.mock.calls[0] as [string];
    expect(path).toMatch(/^\/design\//);
    expect(path).not.toBe(`/design/${design.id}`);
  });

  it("tells how many elements were left out before opening the studio", async () => {
    const design = await startOf(BAG);
    const template = printConfigFor(BAG.productSlug, BAG.sku)!.template;
    // A text on the gusset: the small bag has no such face.
    const document = addElement(emptyDocument(template), "LEFT", textEl("note"));
    await saveDesignDocument(design.id, { version: design.version, document });
    show(design, [BAG.sku, SMALL_BAG]);

    await userEvent.click(await option(SMALL_BAG));
    await confirm();

    expect(
      await screen.findByText(/1 phần tử không có chỗ trên quy cách mới/, undefined, WAIT),
    ).toBeInTheDocument();
    expect(env.push).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Mở studio" }));
    expect(env.push).toHaveBeenCalledTimes(1);
  });

  it("says why the copy is not in the project when the project is closed", async () => {
    const project = await createProject({ name: "Quán Hoa" });
    const design = await startOf(CUP, { projectId: project.id });
    await archiveProject(project.id, { version: project.version });
    show(design, [CUP.sku, "CUP-PAPER-8OZ-KRAFT"]);

    await userEvent.click(await option("CUP-PAPER-8OZ-KRAFT"));
    await confirm();

    expect(
      await screen.findByText(
        /Dự án của bản gốc đã đóng nên bản mới không nằm trong dự án/,
        undefined,
        WAIT,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/không có chỗ trên quy cách mới/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Mở studio" }));
    expect(env.push).toHaveBeenCalledTimes(1);
  });

  it("shows Thử lại when the copy fails and sends it again", async () => {
    const { post } = backend;
    const design = await startOf(CUP);
    show(design, [CUP.sku, "CUP-PAPER-8OZ-KRAFT"]);
    await userEvent.click(await option("CUP-PAPER-8OZ-KRAFT"));
    post.mockRejectedValueOnce(new ApiError(503, "UNAVAILABLE", "down"));

    await confirm();

    expect(await screen.findByText("Chưa nhân bản được", undefined, WAIT)).toBeInTheDocument();
    expect(env.push).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    await waitFor(() => expect(env.push).toHaveBeenCalledTimes(1), WAIT);
  });

  it("offers nothing without a way to read the variants", async () => {
    const design = await startOf(CUP);
    renderWithProviders(<CloneDesignDialog design={design} open onOpenChange={vi.fn()} />);

    expect(
      await screen.findByText(
        "Chưa thể nhân bản thiết kế này sang quy cách khác.",
        undefined,
        WAIT,
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nhân bản" })).toBeDisabled();
  });

  it("re-fits what is stored now, not the copy it read when it opened", async () => {
    const { post } = backend;
    const design = await startOf(CUP);
    show(design, [CUP.sku, "CUP-PAPER-8OZ-KRAFT"]);
    await userEvent.click(await option("CUP-PAPER-8OZ-KRAFT"));

    // Another tab saves a text after the dialog read the empty document.
    const template = printConfigFor(CUP.productSlug, CUP.sku)!.template;
    const saved = addElement(emptyDocument(template), "BODY", textEl("late"));
    await saveDesignDocument(design.id, { version: design.version, document: saved });
    await confirm();

    await waitFor(() => expect(env.push).toHaveBeenCalledTimes(1), WAIT);
    const call = post.mock.calls.find(([url]) => url === `/designs/${design.id}/clones`)!;
    const sent = (call[1] as { document: { surfaces: { BODY: { elements: { id: string }[] } } } })
      .document;
    expect(sent.surfaces.BODY.elements.map((e) => e.id)).toEqual(["late"]);
  });

  it("sends the same Idempotency-Key when it tries again after a failure", async () => {
    const { post } = backend;
    const design = await startOf(CUP);
    show(design, [CUP.sku, "CUP-PAPER-8OZ-KRAFT"]);
    await userEvent.click(await option("CUP-PAPER-8OZ-KRAFT"));
    post.mockRejectedValueOnce(new ApiError(503, "UNAVAILABLE", "down"));

    await confirm();
    await userEvent.click(await screen.findByRole("button", { name: "Thử lại" }, WAIT));

    await waitFor(() => expect(env.push).toHaveBeenCalledTimes(1), WAIT);
    const keys = post.mock.calls
      .filter(([url]) => url === `/designs/${design.id}/clones`)
      .map(([, , config]) => (config as { headers: Record<string, string> }).headers);
    expect(keys).toHaveLength(2);
    expect(keys[0]!["Idempotency-Key"]).toBeTruthy();
    expect(keys[1]).toEqual(keys[0]);
  });

  it("cannot be closed while the copy is being made, so the studio always opens", async () => {
    const onOpenChange = vi.fn();
    const design = await startOf(CUP);
    show(design, [CUP.sku, "CUP-PAPER-8OZ-KRAFT"], onOpenChange);
    await userEvent.click(await option("CUP-PAPER-8OZ-KRAFT"));

    await confirm();
    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: "Huỷ" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Close" })).not.toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();

    await waitFor(() => expect(env.push).toHaveBeenCalledTimes(1), WAIT);
  });

  it("says when the variants cannot be read and tries again", async () => {
    const design = await startOf(CUP);
    const load = vi
      .fn<(slug: string) => Promise<string[]>>()
      .mockRejectedValueOnce(new ApiError(403, "FORBIDDEN", "x"))
      .mockResolvedValue([CUP.sku, "CUP-PAPER-8OZ-KRAFT"]);
    renderWithProviders(
      <CloneDesignDialog design={design} open onOpenChange={vi.fn()} skusOf={load} />,
    );

    expect(
      await screen.findByText("Không tải được các quy cách", undefined, WAIT),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(await option("CUP-PAPER-8OZ-KRAFT")).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(2);
  });
});
