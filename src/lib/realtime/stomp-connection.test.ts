import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  IDLE_CLOSE_MS,
  RECONNECT_BASE_MS,
  RealtimeConnection,
  type RealtimeSocket,
  type RealtimeSocketHandlers,
} from "./stomp-connection";

interface FakeSocket extends RealtimeSocket {
  token: string;
  handlers: RealtimeSocketHandlers;
  /** destination → body callback of each live SUBSCRIBE */
  subs: Map<string, (body: string) => void>;
  subscribeCalls: string[];
  deactivated: boolean;
}

function setup(initialToken: string | null = "token-1") {
  const token = { value: initialToken };
  const sockets: FakeSocket[] = [];
  const socketFactory = vi.fn((_url: string, current: string, handlers: RealtimeSocketHandlers) => {
    const socket: FakeSocket = {
      token: current,
      handlers,
      subs: new Map(),
      subscribeCalls: [],
      deactivated: false,
      activate: vi.fn(),
      deactivate: vi.fn(async () => {
        socket.deactivated = true;
      }),
      subscribe: (destination, onBody) => {
        socket.subscribeCalls.push(destination);
        socket.subs.set(destination, onBody);
        return { unsubscribe: () => socket.subs.delete(destination) };
      },
    };
    sockets.push(socket);
    return socket;
  });
  const connection = new RealtimeConnection({
    url: "ws://localhost:18080/ws",
    getToken: () => token.value,
    socketFactory,
  });
  return { connection, sockets, socketFactory, token };
}

describe("RealtimeConnection", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("connects lazily, on the first subscription, with the bearer token of the moment", () => {
    const { connection, sockets, socketFactory } = setup();
    expect(socketFactory).not.toHaveBeenCalled();
    connection.subscribe("/topic/a", () => undefined);
    expect(socketFactory).toHaveBeenCalledWith(
      "ws://localhost:18080/ws",
      "token-1",
      expect.anything(),
    );
    expect(connection.status).toBe("connecting");
    sockets[0]?.handlers.onConnect();
    expect(connection.status).toBe("connected");
    expect(sockets[0]?.subscribeCalls).toEqual(["/topic/a"]);
  });

  it("subscribes once per destination and hands every listener the parsed body", () => {
    const { connection, sockets } = setup();
    const first = vi.fn();
    const second = vi.fn();
    connection.subscribe("/user/queue/chat", first);
    sockets[0]?.handlers.onConnect();
    connection.subscribe("/user/queue/chat", second);
    expect(sockets[0]?.subscribeCalls).toEqual(["/user/queue/chat"]);
    sockets[0]?.subs.get("/user/queue/chat")?.('{"type":"message.created"}');
    expect(first).toHaveBeenCalledWith({ type: "message.created" });
    expect(second).toHaveBeenCalledWith({ type: "message.created" });
  });

  it("ignores a body that is not JSON", () => {
    const { connection, sockets } = setup();
    const listener = vi.fn();
    connection.subscribe("/topic/a", listener);
    sockets[0]?.handlers.onConnect();
    sockets[0]?.subs.get("/topic/a")?.("not json");
    expect(listener).not.toHaveBeenCalled();
  });

  it("reconnects with backoff after the socket drops, with a fresh token, and subscribes again", async () => {
    const { connection, sockets, token } = setup();
    connection.subscribe("/topic/a", () => undefined);
    sockets[0]?.handlers.onConnect();
    token.value = "token-2";
    sockets[0]?.handlers.onWebSocketClose();
    expect(connection.status).toBe("disconnected");
    await vi.advanceTimersByTimeAsync(RECONNECT_BASE_MS - 1);
    expect(sockets).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(sockets[1]?.token).toBe("token-2");
    sockets[1]?.handlers.onConnect();
    expect(sockets[1]?.subscribeCalls).toEqual(["/topic/a"]);

    // A second drop in a row waits twice as long.
    sockets[1]?.handlers.onStompError({ headers: { message: "boom" }, body: "" });
    sockets[1]?.handlers.onWebSocketClose(); // the close after an ERROR frame is the same failure
    await vi.advanceTimersByTimeAsync(RECONNECT_BASE_MS);
    expect(sockets).toHaveLength(3); // reset after the successful connect: base delay again
  });

  it("doubles the delay while connecting keeps failing", async () => {
    const { connection, sockets } = setup();
    connection.subscribe("/topic/a", () => undefined);
    sockets[0]?.handlers.onWebSocketClose();
    await vi.advanceTimersByTimeAsync(RECONNECT_BASE_MS);
    sockets[1]?.handlers.onWebSocketClose();
    await vi.advanceTimersByTimeAsync(RECONNECT_BASE_MS * 2 - 1);
    expect(sockets).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(sockets).toHaveLength(3);
  });

  it("does not connect without a usable token, and connects as soon as one comes", () => {
    const { connection, socketFactory, token } = setup(null);
    connection.subscribe("/topic/a", () => undefined);
    expect(socketFactory).not.toHaveBeenCalled();
    expect(connection.status).toBe("idle");
    token.value = "token-new";
    connection.tokenChanged();
    expect(socketFactory).toHaveBeenCalledWith(expect.any(String), "token-new", expect.anything());
  });

  it("stops retrying when the token expired meanwhile: the REST client signs out, a new sign-in reconnects", async () => {
    const { connection, sockets, token } = setup();
    connection.subscribe("/topic/a", () => undefined);
    sockets[0]?.handlers.onConnect();
    token.value = null;
    sockets[0]?.handlers.onStompError({
      headers: { message: "The token has expired; connect again" },
      body: "",
    });
    expect(connection.status).toBe("idle");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sockets).toHaveLength(1);
  });

  it("closes the old socket and reconnects when the token changes", () => {
    const { connection, sockets, token } = setup();
    connection.subscribe("/topic/a", () => undefined);
    sockets[0]?.handlers.onConnect();
    token.value = "token-2";
    connection.tokenChanged();
    expect(sockets[0]?.deactivated).toBe(true);
    expect(sockets[1]?.token).toBe("token-2");
  });

  it("does not subscribe again to a destination the BE refused", async () => {
    const { connection, sockets } = setup();
    connection.subscribe("/topic/chat.conversations.x", () => undefined);
    connection.subscribe("/topic/chat.presence", () => undefined);
    sockets[0]?.handlers.onConnect();
    sockets[0]?.handlers.onStompError({
      headers: { message: "Not allowed to subscribe to /topic/chat.conversations.x" },
      body: "",
    });
    await vi.advanceTimersByTimeAsync(RECONNECT_BASE_MS);
    sockets[1]?.handlers.onConnect();
    expect(sockets[1]?.subscribeCalls).toEqual(["/topic/chat.presence"]);
  });

  it("closes a few seconds after the last subscriber left, not at once", async () => {
    const { connection, sockets } = setup();
    const stop = connection.subscribe("/topic/a", () => undefined);
    sockets[0]?.handlers.onConnect();
    stop();
    expect(sockets[0]?.subs.size).toBe(0);
    await vi.advanceTimersByTimeAsync(IDLE_CLOSE_MS - 1);
    expect(sockets[0]?.deactivated).toBe(false);
    // A route change subscribes again in time: the socket stays.
    connection.subscribe("/topic/b", () => undefined);
    await vi.advanceTimersByTimeAsync(IDLE_CLOSE_MS);
    expect(sockets[0]?.deactivated).toBe(false);
    expect(sockets[0]?.subscribeCalls).toEqual(["/topic/a", "/topic/b"]);
  });

  it("goes idle after the last subscriber left for good", async () => {
    const { connection, sockets } = setup();
    const stop = connection.subscribe("/topic/a", () => undefined);
    sockets[0]?.handlers.onConnect();
    stop();
    await vi.advanceTimersByTimeAsync(IDLE_CLOSE_MS);
    expect(sockets[0]?.deactivated).toBe(true);
    expect(connection.status).toBe("idle");
  });

  it("tells status listeners when it connects and drops", () => {
    const { connection, sockets } = setup();
    const statuses: string[] = [];
    connection.onStatus(() => statuses.push(connection.status));
    connection.subscribe("/topic/a", () => undefined);
    sockets[0]?.handlers.onConnect();
    sockets[0]?.handlers.onWebSocketClose();
    expect(statuses).toEqual(["connecting", "connected", "disconnected"]);
  });
});
