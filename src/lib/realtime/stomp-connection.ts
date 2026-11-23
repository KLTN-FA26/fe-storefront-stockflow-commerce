/**
 * One STOMP-over-WebSocket connection to the BE's `/ws` (BE `StompAuthenticationInterceptor`), shared by every
 * subscriber of the tab. Generic: it knows destinations and JSON bodies, nothing about chat.
 *
 * - CONNECT carries `Authorization: Bearer <access token>`: the storefront keeps its token in JS, so it needs no
 *   socket ticket (the back office does, its token is HttpOnly).
 * - It connects lazily, on the first subscription, and closes a few seconds after the last one goes (a route change
 *   unsubscribes and subscribes again; it should not drop the socket in between).
 * - One STOMP subscription per destination, however many listeners: each listener gets every event.
 * - Every (re)connect reads the token again. With no usable token (signed out, or expired: the storefront has no
 *   refresh token, the REST client signs out and sends to the login page) it waits until the token changes
 *   (`tokenChanged`), then connects at once.
 * - Any other failure (network, the BE restarting, a refused frame) reconnects with exponential backoff.
 * - The BE answers a SUBSCRIBE it refuses with an ERROR frame that closes the socket. Such a destination is not
 *   subscribed again until its listeners re-register, or every reconnect would be refused the same way.
 */

import { Client } from "@stomp/stompjs";

export const STOMP_HEARTBEAT_MS = 10_000;
export const RECONNECT_BASE_MS = 2_000;
export const RECONNECT_MAX_MS = 60_000;
/** How long the socket stays open after its last subscriber left. */
export const IDLE_CLOSE_MS = 5_000;

const REFUSED_SUBSCRIPTION = "Not allowed to subscribe to ";

export type RealtimeStatus = "idle" | "connecting" | "connected" | "disconnected";

export interface RealtimeFrame {
  headers: Record<string, string>;
  body: string;
}

export interface RealtimeSubscriptionHandle {
  unsubscribe(): void;
}

/** The part of the stompjs `Client` this module drives, so tests can supply a stand-in. */
export interface RealtimeSocket {
  activate(): void;
  deactivate(): Promise<void>;
  subscribe(destination: string, onBody: (body: string) => void): RealtimeSubscriptionHandle;
}

export interface RealtimeSocketHandlers {
  onConnect(): void;
  onStompError(frame: RealtimeFrame): void;
  onWebSocketClose(): void;
}

export type RealtimeSocketFactory = (
  url: string,
  token: string,
  handlers: RealtimeSocketHandlers,
) => RealtimeSocket;

export const createStompSocket: RealtimeSocketFactory = (url, token, handlers) => {
  const client = new Client({
    brokerURL: url,
    connectHeaders: { Authorization: `Bearer ${token}` },
    heartbeatIncoming: STOMP_HEARTBEAT_MS,
    heartbeatOutgoing: STOMP_HEARTBEAT_MS,
    reconnectDelay: 0, // reconnects are ours: a fresh token for each, with backoff
    onConnect: () => handlers.onConnect(),
    onStompError: (frame) => handlers.onStompError({ headers: frame.headers, body: frame.body }),
    onWebSocketClose: () => handlers.onWebSocketClose(),
  });
  return {
    activate: () => client.activate(),
    deactivate: () => client.deactivate(),
    subscribe: (destination, onBody) =>
      client.subscribe(destination, (message) => onBody(message.body)),
  };
};

export type RealtimeListener = (payload: unknown) => void;

interface Channel {
  listeners: Set<RealtimeListener>;
  handle: RealtimeSubscriptionHandle | null;
  refused: boolean;
}

export interface RealtimeConnectionOptions {
  url: string;
  /** The access token to connect with; null when there is no usable one (none, or expired). */
  getToken: () => string | null;
  socketFactory?: RealtimeSocketFactory;
}

export class RealtimeConnection {
  private readonly url: string;
  private readonly getToken: () => string | null;
  private readonly socketFactory: RealtimeSocketFactory;

  private readonly channels = new Map<string, Channel>();
  private readonly statusListeners = new Set<() => void>();
  private currentStatus: RealtimeStatus = "idle";
  private socket: RealtimeSocket | null = null;
  private generation = 0;
  private failures = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: RealtimeConnectionOptions) {
    this.url = options.url;
    this.getToken = options.getToken;
    this.socketFactory = options.socketFactory ?? createStompSocket;
  }

  get status(): RealtimeStatus {
    return this.currentStatus;
  }

  /** For `useSyncExternalStore`: called on every status change. */
  onStatus(listener: () => void): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  /** Listens to `destination` (each body parsed as JSON); the returned function stops listening. */
  subscribe(destination: string, listener: RealtimeListener): () => void {
    let channel = this.channels.get(destination);
    if (!channel) {
      channel = { listeners: new Set(), handle: null, refused: false };
      this.channels.set(destination, channel);
    }
    channel.listeners.add(listener);
    this.cancelIdleClose();
    if (this.currentStatus === "connected") this.open(destination, channel);
    else if (this.currentStatus === "idle") this.connect();
    return () => this.unsubscribe(destination, listener);
  }

  /** The access token changed (a new sign-in, a sign-out): connect again with it, or close. */
  tokenChanged(): void {
    if (this.channels.size === 0) return;
    this.failures = 0;
    this.close();
    this.connect();
  }

  private unsubscribe(destination: string, listener: RealtimeListener): void {
    const channel = this.channels.get(destination);
    if (!channel) return;
    channel.listeners.delete(listener);
    if (channel.listeners.size > 0) return;
    try {
      channel.handle?.unsubscribe();
    } catch {
      // the socket went down meanwhile: nothing left to unsubscribe from
    }
    this.channels.delete(destination);
    if (this.channels.size === 0) this.scheduleIdleClose();
  }

  private connect(): void {
    this.clearRetry();
    if (!this.url || this.channels.size === 0) return this.setStatus("idle");
    const token = this.getToken();
    if (!token) return this.setStatus("idle");
    const generation = ++this.generation;
    let failed = false;
    const fail = (frame?: RealtimeFrame) => {
      if (failed || generation !== this.generation) return;
      failed = true;
      this.markRefused(frame);
      this.close();
      // No usable token any more: wait for the next one instead of retrying with nothing.
      if (!this.getToken()) return this.setStatus("idle");
      this.setStatus("disconnected");
      this.retryLater();
    };
    this.setStatus("connecting");
    this.socket = this.socketFactory(this.url, token, {
      onConnect: () => {
        if (generation !== this.generation) return;
        this.failures = 0;
        for (const [destination, channel] of this.channels) {
          channel.handle = null;
          this.open(destination, channel);
        }
        this.setStatus("connected");
      },
      onStompError: (frame) => fail(frame),
      onWebSocketClose: () => fail(),
    });
    this.socket.activate();
  }

  private open(destination: string, channel: Channel): void {
    if (channel.handle || channel.refused || !this.socket) return;
    channel.handle = this.socket.subscribe(destination, (body) => {
      let payload: unknown;
      try {
        payload = JSON.parse(body);
      } catch {
        return; // not ours to show: the REST catch-up still brings what this would have
      }
      for (const listener of [...channel.listeners]) listener(payload);
    });
  }

  private markRefused(frame: RealtimeFrame | undefined): void {
    const message = frame?.headers.message ?? "";
    if (!message.startsWith(REFUSED_SUBSCRIPTION)) return;
    const channel = this.channels.get(message.slice(REFUSED_SUBSCRIPTION.length).trim());
    if (channel) channel.refused = true;
  }

  private retryLater(): void {
    const delay = Math.min(RECONNECT_BASE_MS * 2 ** this.failures, RECONNECT_MAX_MS);
    this.failures += 1;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.connect();
    }, delay);
  }

  private scheduleIdleClose(): void {
    this.cancelIdleClose();
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null;
      if (this.channels.size > 0) return;
      this.clearRetry();
      this.close();
      this.setStatus("idle");
    }, IDLE_CLOSE_MS);
  }

  private cancelIdleClose(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
  }

  private clearRetry(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }

  private close(): void {
    this.generation += 1;
    for (const channel of this.channels.values()) channel.handle = null;
    const socket = this.socket;
    this.socket = null;
    if (socket) void socket.deactivate().catch(() => undefined);
  }

  private setStatus(next: RealtimeStatus): void {
    if (next === this.currentStatus) return;
    this.currentStatus = next;
    for (const listener of [...this.statusListeners]) listener();
  }
}
