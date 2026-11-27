import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api/client";
import { RealtimeConnection, RealtimeProvider } from "@/lib/realtime";
import type { RealtimeSocketHandlers } from "@/lib/realtime/stomp-connection";
import { signIn, signOut } from "@/test/render";

import { ChatHeaderLink, ChatUnreadBadge } from "../components/chat-entry";
import { ChatThreadScreen } from "../components/chat-thread-screen";
import { CHAT_POLL, chatKeys } from "../queries";
import { chatTopics } from "../realtime";
import { chatMessageDtoSchema } from "../schemas";
import { upsertMessages, type MessagePages } from "../selectors";
import { CONVERSATION_ID, cardMessageJson, conversationJson, messageJson } from "./fixtures";

const PERMISSIONS = {
  roles: ["CUSTOMER"],
  permissions: ["chat-conversations:READ", "chat-conversations:UPDATE"],
  dataScope: "OWN",
};
const ORDER_ID = "88888888-8888-4888-8888-888888888888";
const CONTRACT_ID = "66666666-6666-4666-8666-666666666666";

/** A connection whose socket the test drives: `connect()` plays the BE accepting CONNECT. */
function fakeRealtime() {
  const handlers: RealtimeSocketHandlers[] = [];
  const deliver = new Map<string, (body: string) => void>();
  const connection = new RealtimeConnection({
    url: "ws://test/ws",
    getToken: () => "token",
    socketFactory: (_url, _token, h) => {
      handlers.push(h);
      return {
        activate: () => undefined,
        deactivate: async () => undefined,
        subscribe: (destination, onBody) => {
          deliver.set(destination, onBody);
          return { unsubscribe: () => deliver.delete(destination) };
        },
      };
    },
  });
  return {
    connection,
    connect: () => act(() => handlers.at(-1)?.onConnect()),
    push: (destination: string, payload: unknown) =>
      act(() => deliver.get(destination)?.(JSON.stringify(payload))),
    subscribed: () => [...deliver.keys()],
  };
}

function renderLive(ui: ReactNode, connection: RealtimeConnection | null = null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <RealtimeProvider enabled connection={connection}>
        <NuqsTestingAdapter>{ui}</NuqsTestingAdapter>
      </RealtimeProvider>
    </QueryClientProvider>,
  );
  return client;
}

function mockBackend(
  overrides: { conversation?: Record<string, unknown>; items?: unknown[] } = {},
) {
  const items = overrides.items ?? [messageJson({ id: "m-1", seq: 1, body: "Xin chào" })];
  return vi.spyOn(api, "get").mockImplementation(async (url: string) => {
    if (url === "/identity/me/permissions") return { data: PERMISSIONS };
    if (url.endsWith("/unread-count")) return { data: { conversations: 1, messages: 2 } };
    if (url.endsWith("/messages")) return { data: { items, lastSeq: 1 } };
    return { data: conversationJson(overrides.conversation ?? {}) };
  });
}

const observerOptions = (client: QueryClient, queryKey: readonly unknown[]) =>
  client.getQueryCache().find({ queryKey, exact: true })?.observers[0]?.options;

beforeEach(() => {
  signIn();
  vi.spyOn(api, "post").mockResolvedValue({ data: { conversationId: CONVERSATION_ID, seq: 1 } });
});
afterEach(() => {
  vi.restoreAllMocks();
  signOut();
});

describe("A.2 polling without a socket", () => {
  it("SF-UX-6: the message pages never poll; one catch-up every 5 s, none in a background tab", async () => {
    mockBackend();
    const client = renderLive(<ChatThreadScreen conversationId={CONVERSATION_ID} />);
    await screen.findByText("Xin chào");
    await waitFor(() =>
      expect(observerOptions(client, chatKeys.catchUp(CONVERSATION_ID))).toBeDefined(),
    );
    const pages = observerOptions(client, chatKeys.messages(CONVERSATION_ID));
    expect(pages?.refetchInterval).toBeUndefined();
    expect(pages?.refetchOnWindowFocus).toBe(false);
    const catchUp = observerOptions(client, chatKeys.catchUp(CONVERSATION_ID));
    expect(catchUp?.refetchInterval).toBe(CHAT_POLL.catchUpMs);
    expect(catchUp?.refetchIntervalInBackground).toBe(false);
  });

  it("the catch-up reads only the newest page, not every page scrolled back through", async () => {
    const get = mockBackend();
    renderLive(<ChatThreadScreen conversationId={CONVERSATION_ID} />);
    await screen.findByText("Xin chào");
    await waitFor(() =>
      expect(get.mock.calls.filter(([url]) => String(url).endsWith("/messages"))).toHaveLength(2),
    );
    const reads = get.mock.calls
      .filter(([url]) => String(url).endsWith("/messages"))
      .map(([, config]) => (config as { params: Record<string, number> }).params);
    // The first page, then the catch-up: the newest page, no `before`, no `since`.
    expect(reads[1]).toEqual({ limit: 30 });
  });

  it("L-1: the header link and every badge share ONE unread-count request", async () => {
    const get = mockBackend();
    renderLive(
      <>
        <ChatHeaderLink className="" />
        <ChatUnreadBadge />
        <ChatUnreadBadge />
      </>,
    );
    expect(await screen.findAllByText("2")).toHaveLength(3);
    expect(get.mock.calls.filter(([url]) => String(url).endsWith("/unread-count"))).toHaveLength(1);
  });
});

describe("A.1 with the STOMP socket up", () => {
  it("subscribes to the thread, the presence and the customer's queue once, and polls only as a fallback", async () => {
    mockBackend();
    const live = fakeRealtime();
    const client = renderLive(
      <>
        <ChatHeaderLink className="" />
        <ChatUnreadBadge />
        <ChatThreadScreen conversationId={CONVERSATION_ID} />
      </>,
      live.connection,
    );
    await screen.findByText("Xin chào");
    live.connect();
    expect(live.subscribed().sort()).toEqual(
      [chatTopics.conversation(CONVERSATION_ID), chatTopics.presence, chatTopics.userQueue].sort(),
    );
    await waitFor(() =>
      expect(observerOptions(client, chatKeys.catchUp(CONVERSATION_ID))?.refetchInterval).toBe(
        CHAT_POLL.fallbackMs,
      ),
    );
    expect(observerOptions(client, chatKeys.unread())?.refetchInterval).toBe(CHAT_POLL.fallbackMs);
    expect(observerOptions(client, chatKeys.detail(CONVERSATION_ID))?.refetchInterval).toBe(
      CHAT_POLL.fallbackMs,
    );
  });

  it("a pushed message appears in the thread at once", async () => {
    mockBackend();
    const live = fakeRealtime();
    renderLive(<ChatThreadScreen conversationId={CONVERSATION_ID} />, live.connection);
    await screen.findByText("Xin chào");
    live.connect();
    live.push(chatTopics.conversation(CONVERSATION_ID), {
      type: "message.created",
      conversationId: CONVERSATION_ID,
      data: messageJson({ id: "m-9", seq: 9, body: "Sale gửi báo giá ngay" }),
    });
    expect(await screen.findByText("Sale gửi báo giá ngay")).toBeInTheDocument();
  });

  it("presence marks the Sale in charge online without a refetch", async () => {
    mockBackend({ conversation: { agentOnline: false } });
    const live = fakeRealtime();
    const client = renderLive(
      <ChatThreadScreen conversationId={CONVERSATION_ID} />,
      live.connection,
    );
    await screen.findByText(/Sale phụ trách/);
    live.connect();
    // The catch-up after connecting has landed; the push comes after it.
    await waitFor(() => expect(client.isFetching()).toBe(0));
    live.push(chatTopics.presence, {
      type: "presence",
      conversationId: null,
      data: { userId: "a0000000-0000-4000-8000-000000000001", online: true },
    });
    expect(await screen.findByText(/Đang trực tuyến/)).toBeInTheDocument();
  });
});

describe("SF-UX-23: new messages while the customer reads older ones", () => {
  it("keeps the position and offers 'Tin nhắn mới', which goes to the end", async () => {
    const user = userEvent.setup();
    mockBackend();
    const client = renderLive(<ChatThreadScreen conversationId={CONVERSATION_ID} />);
    await screen.findByText("Xin chào");
    const log = screen.getByRole("log", { name: "Tin nhắn" });
    let top = 0;
    Object.defineProperty(log, "scrollHeight", { configurable: true, value: 2000 });
    Object.defineProperty(log, "clientHeight", { configurable: true, value: 400 });
    Object.defineProperty(log, "scrollTop", {
      configurable: true,
      get: () => top,
      set: (value: number) => (top = value),
    });
    top = 200; // reading an older card
    fireEvent.scroll(log);

    const arrived = chatMessageDtoSchema.parse(messageJson({ id: "m-2", seq: 2, body: "Mới" }));
    act(() =>
      client.setQueryData<MessagePages>(chatKeys.messages(CONVERSATION_ID), (data) =>
        upsertMessages(data, [arrived]),
      ),
    );
    const pill = await screen.findByRole("button", { name: "Tin nhắn mới" });
    expect(top).toBe(200);
    await user.click(pill);
    expect(top).toBe(2000);
    expect(screen.queryByRole("button", { name: "Tin nhắn mới" })).not.toBeInTheDocument();
  });
});

describe("thread header (SF-UX-22, -26, -27)", () => {
  const contexts = [
    { id: "x1", kind: "ORDER", refId: ORDER_ID, label: "SO-1", status: "PENDING_CONTRACT" },
    { id: "x2", kind: "CONTRACT", refId: CONTRACT_ID, label: "HD-1", status: "SENT" },
    { id: "x3", kind: "PRODUCTION_ORDER", refId: "po-1", label: "PO-DEMO-0001" },
  ];

  it("links the contract to its order's contract section and hides the production order", async () => {
    const user = userEvent.setup();
    mockBackend({ conversation: { contexts } });
    renderLive(<ChatThreadScreen conversationId={CONVERSATION_ID} />);
    await user.click(await screen.findByRole("button", { name: /Chứng từ/ }));
    const chips = await screen.findByRole("list", { name: "Chứng từ của cuộc trò chuyện" });
    expect(within(chips).getByRole("link", { name: "Hợp đồng HD-1" })).toHaveAttribute(
      "href",
      `/account/orders/${ORDER_ID}#hop-dong`,
    );
    expect(chips).not.toHaveTextContent("PO-DEMO-0001");
    expect(chips).not.toHaveTextContent("Đơn sản xuất");
  });

  it("keeps the documents in a side panel behind 'Chứng từ (n)', counting only the shown ones", async () => {
    const user = userEvent.setup();
    mockBackend({ conversation: { contexts } });
    renderLive(<ChatThreadScreen conversationId={CONVERSATION_ID} />);
    const toggle = await screen.findByRole("button", { name: "Chứng từ (2)" });
    expect(
      screen.queryByRole("list", { name: "Chứng từ của cuộc trò chuyện" }),
    ).not.toBeInTheDocument();
    await user.click(toggle);
    const panel = await screen.findByRole("dialog", { name: "Chứng từ của cuộc trò chuyện" });
    expect(within(panel).getAllByRole("listitem")).toHaveLength(2);
  });

  it("promises nothing when the BE does not say it is business hours", async () => {
    mockBackend({ conversation: { withinBusinessHours: null } });
    renderLive(<ChatThreadScreen conversationId={CONVERSATION_ID} />);
    await screen.findByText(/Sale phụ trách/);
    expect(screen.queryByText(/thường phản hồi trong ít phút/)).not.toBeInTheDocument();
  });
});

describe("SF-UX-24: the signed copy sent in the thread", () => {
  it("the SENT contract card says when the copy was sent and that Sale must confirm it", async () => {
    const contract = cardMessageJson(
      "CONTRACT",
      { contractId: CONTRACT_ID, number: "HD-1", orderId: ORDER_ID, status: "SENT" },
      {},
      { id: "card-1", seq: 1 },
    );
    const scan = messageJson({
      id: "m-2",
      seq: 2,
      kind: "ATTACHMENT",
      senderType: "CUSTOMER",
      body: null,
      sentAt: "2026-11-20T03:15:00Z",
      attachments: [{ id: "f1", fileName: "hd-da-ky.pdf", contentType: "application/pdf" }],
    });
    mockBackend({ items: [scan, contract] });
    renderLive(<ChatThreadScreen conversationId={CONVERSATION_ID} />);
    const card = await screen.findByRole("region", { name: /Hợp đồng mua bán/ });
    expect(within(card).getByText("Chờ Sale xác nhận")).toBeInTheDocument();
    expect(within(card).getByRole("status")).toHaveTextContent(
      /Đã gửi bản ký lúc .*chờ Sale xác nhận/,
    );
  });
});
