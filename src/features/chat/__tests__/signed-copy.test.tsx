import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { UrlUpdateEvent } from "nuqs/adapters/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { STORE_ROUTES } from "@/constants";
import { api } from "@/lib/api/client";
import { renderWithProviders } from "@/test/render";

import { ChatNewScreen } from "../components/chat-new-screen";
import { ChatThreadScreen } from "../components/chat-thread-screen";
import { signedCopyIntentOf } from "../selectors";
import { CONVERSATION_ID, conversationJson, messageJson } from "./fixtures";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push: vi.fn() }) }));

const PERMISSIONS = {
  roles: ["CUSTOMER"],
  permissions: [
    "chat-conversations:CREATE",
    "chat-conversations:READ",
    "chat-conversations:UPDATE",
  ],
  dataScope: "OWN",
};
const CONTRACT_ID = "66666666-6666-4666-8666-666666666666";
const PROMPT = "Gửi bản hợp đồng đã ký: chọn file PDF hoặc ảnh";

beforeEach(() => replace.mockReset());
afterEach(() => vi.restoreAllMocks());

describe("the signed contract's hand-off from the order page to the chat (attach=pdf)", () => {
  it("routes carry the intent: the order page's link and the thread it opens", () => {
    expect(STORE_ROUTES.chat.about("CONTRACT", CONTRACT_ID, "pdf")).toBe(
      `/chat/new?kind=CONTRACT&id=${CONTRACT_ID}&attach=pdf`,
    );
    expect(STORE_ROUTES.chat.detail("c-1", "pdf")).toBe("/chat/c-1?attach=pdf");
    expect(STORE_ROUTES.chat.detail("c-1")).toBe("/chat/c-1");
  });

  it("keeps the intent only for a contract's conversation and a known value", () => {
    expect(signedCopyIntentOf("CONTRACT", "pdf")).toBe("pdf");
    expect(signedCopyIntentOf("QUOTE", "pdf")).toBeUndefined();
    expect(signedCopyIntentOf("CONTRACT", "zip")).toBeUndefined();
    expect(signedCopyIntentOf(undefined, "pdf")).toBeUndefined();
  });

  it("the new-conversation page says what comes next and opens the thread with ?attach=pdf", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ data: PERMISSIONS });
    vi.spyOn(api, "post").mockResolvedValue({ data: conversationJson({ id: "c-new" }) });
    const user = userEvent.setup();
    renderWithProviders(<ChatNewScreen kind="CONTRACT" id={CONTRACT_ID} attach="pdf" />);
    expect(screen.getByText(/chọn file hợp đồng đã ký \(PDF hoặc ảnh\)/)).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "Bắt đầu trò chuyện" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/chat/c-new?attach=pdf"));
  });

  it("drops attach for a conversation about anything but a contract", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ data: PERMISSIONS });
    vi.spyOn(api, "post").mockResolvedValue({ data: conversationJson({ id: "c-new" }) });
    const user = userEvent.setup();
    renderWithProviders(<ChatNewScreen kind="QUOTE" id="q-1" attach="pdf" />);
    expect(screen.queryByText(/hợp đồng đã ký/)).not.toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "Bắt đầu trò chuyện" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/chat/c-new"));
  });
});

describe("the thread's prompt for the signed contract", () => {
  const backend = () => {
    vi.spyOn(api, "get").mockImplementation(async (url: string) => {
      if (url === "/identity/me/permissions") return { data: PERMISSIONS };
      if (url.endsWith("/messages")) return { data: { items: [], lastSeq: 0 } };
      return { data: conversationJson() };
    });
  };
  const openThread = (searchParams: string) => {
    const updates: UrlUpdateEvent[] = [];
    renderWithProviders(<ChatThreadScreen conversationId={CONVERSATION_ID} />, {
      searchParams,
      onUrlUpdate: (event) => updates.push(event),
    });
    return updates;
  };

  it("is not there without ?attach=pdf", async () => {
    backend();
    openThread("");
    await screen.findByRole("textbox", { name: "Nội dung tin nhắn" });
    expect(screen.queryByText(PROMPT)).not.toBeInTheDocument();
  });

  it("asks above the composer; its button opens the file picker (a user's click), not the page", async () => {
    backend();
    const click = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => undefined);
    const user = userEvent.setup();
    openThread("?attach=pdf");
    expect(await screen.findByText(PROMPT)).toBeInTheDocument();
    expect(click).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Chọn file" }));
    expect(click).toHaveBeenCalledTimes(1);
    const picker = screen.getByLabelText<HTMLInputElement>("Chọn ảnh hoặc file PDF");
    expect(picker.accept).toContain("application/pdf");
    expect(picker.accept).toContain("image/jpeg");
  });

  it("can be dismissed, and leaves the URL so a reload does not ask again", async () => {
    backend();
    const user = userEvent.setup();
    const updates = openThread("?attach=pdf");
    await user.click(await screen.findByRole("button", { name: "Ẩn lời nhắc gửi hợp đồng đã ký" }));
    expect(screen.queryByText(PROMPT)).not.toBeInTheDocument();
    await waitFor(() => expect(updates.at(-1)?.searchParams.has("attach")).toBe(false));
  });

  it("is gone once a file was sent", async () => {
    backend();
    const post = vi
      .spyOn(api, "post")
      .mockResolvedValue({ data: messageJson({ senderType: "CUSTOMER", body: null }) });
    const user = userEvent.setup();
    const updates = openThread("?attach=pdf");
    await screen.findByText(PROMPT);
    const scan = new File(["%PDF-1.7"], "hop-dong-da-ky.pdf", { type: "application/pdf" });
    await user.upload(screen.getByLabelText("Chọn ảnh hoặc file PDF"), scan);
    // Choosing alone does not count: the prompt stays until the file is sent.
    expect(screen.getByText(PROMPT)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Gửi tin nhắn" }));
    const uploads = () => post.mock.calls.filter(([url]) => String(url).endsWith("/attachments"));
    await waitFor(() => expect(uploads()).toHaveLength(1));
    await waitFor(() => expect(screen.queryByText(PROMPT)).not.toBeInTheDocument());
    expect(updates.at(-1)?.searchParams.has("attach")).toBe(false);
  });
});

describe("an ended contract conversation reopened as a new one", () => {
  it("keeps asking for the signed contract in the new thread", async () => {
    vi.spyOn(api, "get").mockImplementation(async (url: string) => {
      if (url === "/identity/me/permissions") return { data: PERMISSIONS };
      if (url.endsWith("/messages")) return { data: { items: [], lastSeq: 0 } };
      return { data: conversationJson({ status: "CLOSED" }) };
    });
    vi.spyOn(api, "post").mockResolvedValue({ data: conversationJson({ id: "c-next" }) });
    const user = userEvent.setup();
    renderWithProviders(<ChatThreadScreen conversationId={CONVERSATION_ID} />, {
      searchParams: "?attach=pdf",
    });
    await user.click(await screen.findByRole("button", { name: "Mở lại cuộc trò chuyện" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/chat/c-next?attach=pdf"));
  });
});
