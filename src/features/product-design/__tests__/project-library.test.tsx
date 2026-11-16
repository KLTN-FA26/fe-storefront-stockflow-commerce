import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api/client";
import { renderWithProviders, signIn, signOut } from "@/test/render";

import {
  archiveProject,
  createProject,
  getProject,
  listProjectLibrary,
  saveTextStyle,
  uploadLibraryImage,
} from "../api";
import { ProjectLibrary } from "../components/project-library";
import { pngBytes } from "../engine/__tests__/fixtures";
import { textStyleSchema } from "../library-schemas";
import { designBackend } from "./design-backend";
import { projectAssetDto, textStyleDto } from "./project-fixtures";

// jsdom draws nothing: an SVG is "rasterised" to a PNG of the fixture's bytes.
vi.mock("../engine", async (original) => ({
  ...(await original<typeof import("../engine")>()),
  rasterizeSvg: vi.fn(async () => new Blob([pngBytes(400, 300)], { type: "image/png" })),
}));

/** The real call, taken before any spy replaces it. */
const REAL_GET = api.get.bind(api);

vi.setConfig({ testTimeout: 30_000 });
const LISTED = { timeout: 8000 };

beforeEach(() => signIn());
afterEach(() => {
  vi.restoreAllMocks();
  signOut();
});

const png = (name: string) => new File([pngBytes(400, 300)], name, { type: "image/png" });

/** A project whose library holds one image ("logo.png") and one text style. */
async function withLibrary() {
  const backend = await designBackend();
  const project = await createProject({ name: "Bộ ly quán Hoa" });
  await uploadLibraryImage(project.id, png("logo.png"), "logo.png", "key-1");
  await saveTextStyle(project.id, {
    text: "Cà phê Sữa",
    style: textStyleSchema.parse(textStyleDto({ sizePt: 20 })),
  });
  return { ...backend, project: await getProject(project.id) };
}

const show = (project: Awaited<ReturnType<typeof withLibrary>>["project"]) =>
  renderWithProviders(<ProjectLibrary project={project} />);

describe("the library of the project page: images", () => {
  it("lists the images with the n/30 counter", async () => {
    const { project } = await withLibrary();
    show(project);

    expect(await screen.findByText("1/30", undefined, LISTED)).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Ảnh" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("list", { name: "Ảnh của dự án" })).toBeInTheDocument();
    expect(screen.getByText("logo.png")).toBeInTheDocument();
  });

  it("uploads an image and counts it", async () => {
    const user = userEvent.setup();
    const { project } = await withLibrary();
    show(project);
    await screen.findByText("1/30", undefined, LISTED);

    await user.upload(screen.getByLabelText("Kéo thả hoặc chọn ảnh"), png("menu.png"));

    expect(await screen.findByText("2/30", undefined, LISTED)).toBeInTheDocument();
    expect(screen.getByText("menu.png")).toBeInTheDocument();
    expect((await listProjectLibrary(project.id)).filter((i) => i.kind === "IMAGE")).toHaveLength(
      2,
    );
  });

  it("turns away a file the default rules refuse, without sending it", async () => {
    const user = userEvent.setup({ applyAccept: false });
    const { project, post } = await withLibrary();
    show(project);
    await screen.findByText("1/30", undefined, LISTED);
    post.mockClear();

    await user.upload(
      screen.getByLabelText("Kéo thả hoặc chọn ảnh"),
      new File(["GIF89a"], "anim.gif", { type: "image/gif" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("Định dạng không được hỗ trợ");
    expect(post.mock.calls.some(([url]) => String(url).endsWith("/assets"))).toBe(false);
    expect(screen.getByText("1/30")).toBeInTheDocument();
  });

  it("draws an SVG to a PNG, as a design's upload does, and sends that", async () => {
    const user = userEvent.setup({ applyAccept: false });
    const { project, post } = await withLibrary();
    show(project);
    await screen.findByText("1/30", undefined, LISTED);
    post.mockClear();

    await user.upload(
      screen.getByLabelText("Kéo thả hoặc chọn ảnh"),
      new File(["<svg xmlns='http://www.w3.org/2000/svg'/>"], "mark.svg", {
        type: "image/svg+xml",
      }),
    );

    expect(await screen.findByText("2/30", undefined, LISTED)).toBeInTheDocument();
    expect(screen.getByText("mark.png")).toBeInTheDocument();
    expect(post.mock.calls.filter(([url]) => String(url).endsWith("/assets"))).toHaveLength(1);
  });

  it("asks before deleting, says the designs keep their copies, and deletes on confirm", async () => {
    const user = userEvent.setup();
    const { project } = await withLibrary();
    show(project);
    await user.click(await screen.findByRole("button", { name: "Xoá ảnh logo.png" }, LISTED));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent(/không bị ảnh hưởng/);
    await user.click(within(dialog).getByRole("button", { name: "Huỷ" }));
    expect(screen.getByText("logo.png")).toBeInTheDocument();
    expect(await listProjectLibrary(project.id)).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: "Xoá ảnh logo.png" }));
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Xoá" }),
    );

    expect(await screen.findByText("0/30", undefined, LISTED)).toBeInTheDocument();
    expect(screen.queryByText("logo.png")).not.toBeInTheDocument();
  });

  it("locks the upload with the reason at 30 images", async () => {
    const { project, get } = await withLibrary();
    const full = Array.from({ length: 30 }, (_, i) =>
      projectAssetDto({
        assetId: `7a1b0000-0000-4000-8000-${String(i).padStart(12, "0")}`,
        originalName: `a${i}.png`,
      }),
    );
    get.mockImplementation((url, ...rest) =>
      String(url).endsWith("/assets")
        ? Promise.resolve({ data: full } as never)
        : REAL_GET(url, ...rest),
    );
    show(project);

    expect(await screen.findByText("30/30", undefined, LISTED)).toBeInTheDocument();
    expect(screen.getByLabelText("Kéo thả hoặc chọn ảnh")).toBeDisabled();
    expect(screen.getByText("Thư viện đã đủ 30 ảnh")).toBeInTheDocument();
  });

  it("is view-only once the project is closed", async () => {
    const { project } = await withLibrary();
    await archiveProject(project.id, { version: project.version });
    show(await getProject(project.id));

    expect(await screen.findByText("logo.png", undefined, LISTED)).toBeInTheDocument();
    expect(screen.getByLabelText("Kéo thả hoặc chọn ảnh")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Xoá ảnh logo.png" })).toBeDisabled();
    expect(screen.getAllByText("Dự án đã đóng").length).toBeGreaterThan(0);
  });
});

describe("the library of the project page: text styles", () => {
  it("lists the saved texts with font, size and colour swatch, and deletes with confirm", async () => {
    const user = userEvent.setup();
    const { project } = await withLibrary();
    show(project);
    await user.click(screen.getByRole("tab", { name: "Chữ" }));

    const list = await screen.findByRole("list", { name: "Mẫu chữ của dự án" }, LISTED);
    expect(within(list).getByText("Cà phê Sữa")).toBeInTheDocument();
    expect(within(list).getByText(/Be Vietnam Pro · 20 pt/)).toBeInTheDocument();
    expect(within(list).getByLabelText("Màu #112233")).toBeInTheDocument();
    expect(screen.getByText("1/30")).toBeInTheDocument();

    await user.click(within(list).getByRole("button", { name: "Xoá mẫu chữ Cà phê Sữa" }));
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Xoá" }),
    );

    expect(await screen.findByText(/Chưa có mẫu chữ nào/, undefined, LISTED)).toBeInTheDocument();
  });
});
