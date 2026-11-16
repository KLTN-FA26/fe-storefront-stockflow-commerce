import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/error";
import { MOCK_DESIGN_IDS } from "@/lib/api/mock-fixtures/design-seed";
import { renderWithProviders, signIn, signOut } from "@/test/render";

import { SubmittedFiles } from "../components/studio/submitted-files";
import { designBackend } from "./design-backend";

// "File đã gửi": the newest file of each role, a link asked for on a click (10-minute, attachment),
// and the BE's integrity refusal of an approved file in words.

const { draft, approved } = MOCK_DESIGN_IDS;

/** The client's own `get`, before the backend's pass-through spy wraps it. */
const realGet = api.get.bind(api);

/** The tab `window.open` hands back: where it is sent, and whether it was closed. */
type FakeTab = {
  opener: unknown;
  location: { replace: ReturnType<typeof vi.fn> };
  close: ReturnType<typeof vi.fn>;
};
let tab: FakeTab;

beforeEach(() => {
  signIn();
  tab = { opener: window, location: { replace: vi.fn() }, close: vi.fn() };
  vi.stubGlobal(
    "open",
    vi.fn(() => tab),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  signOut();
});

type Get = Awaited<ReturnType<typeof designBackend>>["get"];

/** What the client got back for the first `get` whose path ends with `end`. */
async function answerOf<T>(get: Get, end: string): Promise<T> {
  const index = get.mock.calls.findIndex(([url]) => String(url).endsWith(end));
  if (index < 0) throw new Error(`No request ending with ${end}`);
  const { data } = (await get.mock.results[index]!.value) as { data: T };
  return data;
}

type ArtifactAnswer = { artifactId: string; role: string };

/** The approved design's frozen file of `role`, as the snapshot read listed it. */
async function frozenFile(get: Get, role: string): Promise<ArtifactAnswer> {
  const snapshot = await answerOf<{ artifacts: ArtifactAnswer[] }>(get, "/snapshot");
  const file = snapshot.artifacts.find((artifact) => artifact.role === role);
  if (!file) throw new Error(`No ${role} in the snapshot`);
  return file;
}

/** The link of the one file the customer asked for: its path names that file, its URL is the answer's. */
async function linkAsked(get: Get, artifactId: string): Promise<string> {
  const asked = get.mock.calls.filter(([url]) => String(url).includes("download-url"));
  expect(asked.map(([url]) => url)).toEqual([
    `/designs/${approved}/artifacts/${artifactId}/download-url`,
  ]);
  return (await answerOf<{ url: string }>(get, "/download-url")).url;
}

const openList = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(await screen.findByRole("button", { name: /File đã gửi/ }));
  return screen.findAllByRole("button", { name: /\d/ });
};

describe("SubmittedFiles", () => {
  it("shows nothing for a design that was never sent", async () => {
    await designBackend();
    renderWithProviders(<SubmittedFiles designId={draft} />);
    await waitFor(() => expect(screen.queryByRole("button")).not.toBeInTheDocument());
  });

  it("lists an approved design's frozen files and asks for a link only when one is clicked", async () => {
    const user = userEvent.setup();
    const { get } = await designBackend();
    renderWithProviders(<SubmittedFiles designId={approved} approved />);

    const files = await openList(user);

    expect(files.map((f) => f.textContent)).toEqual([
      expect.stringContaining("Ảnh xem trước"),
      expect.stringContaining("File in (PDF)"),
      expect.stringContaining("Đặc tả kỹ thuật (PDF)"),
    ]);
    const asked = () => get.mock.calls.filter(([url]) => String(url).includes("download-url"));
    expect(asked()).toHaveLength(0);

    await user.click(files[1]!);

    await waitFor(() => expect(tab.location.replace).toHaveBeenCalledTimes(1));
    expect(window.open).toHaveBeenCalledTimes(1);
    // The clicked file's link, and the tab sent to exactly that link.
    const print = await frozenFile(get, "PRINT_READY");
    const url = await linkAsked(get, print.artifactId);
    expect(tab.location.replace).toHaveBeenCalledWith(url);
    expect(tab.opener).toBeNull(); // the new tab cannot reach back into the studio
  });

  it("opens the tab in the click itself, before the link is asked for: no popup to block", async () => {
    const user = userEvent.setup();
    const { get } = await designBackend();
    renderWithProviders(<SubmittedFiles designId={approved} approved />);
    const files = await openList(user);
    // The link request does not answer until the test says so.
    let answer!: () => void;
    const held = new Promise<void>((resolve) => (answer = resolve));
    get.mockImplementation(async (...args: Parameters<typeof api.get>) => {
      if (String(args[0]).includes("download-url")) await held;
      return realGet(...args);
    });

    await user.click(files[0]!);

    // Opened while the link is still being asked for: inside the click, not after an await.
    expect(window.open).toHaveBeenCalledWith("", "_blank");
    expect(tab.location.replace).not.toHaveBeenCalled();
    answer();
    await waitFor(() => expect(tab.location.replace).toHaveBeenCalledTimes(1));
    const preview = await frozenFile(get, "CUSTOMER_PREVIEW");
    expect(tab.location.replace).toHaveBeenCalledWith(await linkAsked(get, preview.artifactId));
  });

  it("shows the link to click when the browser refuses even that tab", async () => {
    const user = userEvent.setup();
    const { get } = await designBackend();
    vi.stubGlobal(
      "open",
      vi.fn(() => null),
    );
    renderWithProviders(<SubmittedFiles designId={approved} approved />);

    const files = await openList(user);
    await user.click(files[1]!);

    const link = await screen.findByRole("link", { name: "Mở File in (PDF)" });
    const print = await frozenFile(get, "PRINT_READY");
    expect(link).toHaveAttribute("href", await linkAsked(get, print.artifactId));
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("says the stored file failed its integrity check, and to contact the shop, on a 409 CONFLICT", async () => {
    const user = userEvent.setup();
    const { store } = await designBackend();
    await store.simulateCorruptFile(approved, "PRINT_READY");
    renderWithProviders(<SubmittedFiles designId={approved} approved />);

    const files = await openList(user);
    await user.click(files[1]!);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /kiểm tra toàn vẹn.*liên hệ cửa hàng/,
    );
    expect(tab.close).toHaveBeenCalledTimes(1); // the blank tab opened for it goes again
    expect(tab.location.replace).not.toHaveBeenCalled();
  });

  it("says a file missing from the store cannot be had now (503 STORAGE_ERROR), not that it was saved", async () => {
    const user = userEvent.setup();
    const { get } = await designBackend();
    renderWithProviders(<SubmittedFiles designId={approved} approved />);
    const files = await openList(user);
    get.mockImplementation((...args: Parameters<typeof api.get>) =>
      String(args[0]).includes("download-url")
        ? Promise.reject(new ApiError(503, "STORAGE_ERROR", "File storage is unavailable"))
        : realGet(...args),
    );

    await user.click(files[1]!);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Chưa lấy được tệp lúc này. Vui lòng thử lại sau ít phút.",
    );
    expect(tab.close).toHaveBeenCalledTimes(1); // the blank tab opened for it goes again
    expect(tab.location.replace).not.toHaveBeenCalled();
  });

  it("says the list could not be read, and Thử lại reads it again", async () => {
    const user = userEvent.setup();
    const { get } = await designBackend();
    let failing = true;
    get.mockImplementation((...args: Parameters<typeof api.get>) =>
      failing && String(args[0]).endsWith("/snapshot")
        ? Promise.reject(new ApiError(403, "FORBIDDEN", "no"))
        : realGet(...args),
    );
    renderWithProviders(<SubmittedFiles designId={approved} approved />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Chưa tải được danh sách file đã gửi.",
    );
    failing = false;
    await user.click(screen.getByRole("button", { name: "Thử lại" }));

    expect(await screen.findByRole("button", { name: /File đã gửi/ })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("keeps the latest submission's files and the approved snapshot's apart", async () => {
    const { get } = await designBackend();
    const reads = (end: string) => get.mock.calls.filter(([url]) => String(url).endsWith(end));

    // The same design in one cache, as its latest files and as its approved ones: each list is
    // read by its own request, neither answered from the other's cache entry.
    renderWithProviders(
      <>
        <SubmittedFiles designId={approved} />
        <SubmittedFiles designId={approved} approved />
      </>,
    );

    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: /File đã gửi/ })).toHaveLength(2),
    );
    expect(reads("/snapshot")).toHaveLength(1);
    expect(reads("/artifacts")).toHaveLength(1);
  });
});
