"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import { useAuthStore } from "@/lib/auth/auth-store";
import { isTokenExpired } from "@/lib/auth/jwt";

import { REALTIME_WS_URL } from "./config";
import { RealtimeConnection, type RealtimeListener } from "./stomp-connection";

const RealtimeContext = createContext<RealtimeConnection | null>(null);

/** The access token the socket may use: none while signed out or once it expired (the BE would refuse it). */
function usableToken(): string | null {
  const token = useAuthStore.getState().tokens?.accessToken;
  return token && !isTokenExpired(token) ? token : null;
}

interface RealtimeProviderProps {
  /** False in mock mode: there is no BE socket behind the mock adapter. */
  enabled: boolean;
  /** The `/ws` address; `NEXT_PUBLIC_WS_URL` by default. Empty → no socket, everything stays on polling. */
  url?: string;
  /** Tests hand in their own connection. */
  connection?: RealtimeConnection | null;
  children: ReactNode;
}

/**
 * ONE STOMP connection per tab, opened lazily by the first subscriber (`useRealtimeSubscription`) and following the
 * signed-in token: a new sign-in reconnects with the new token, a sign-out closes it.
 */
export function RealtimeProvider({
  enabled,
  url = REALTIME_WS_URL,
  connection: given,
  children,
}: RealtimeProviderProps) {
  const [connection] = useState<RealtimeConnection | null>(() => {
    if (given !== undefined) return given;
    if (!enabled || !url || typeof window === "undefined") return null;
    return new RealtimeConnection({ url, getToken: usableToken });
  });

  useEffect(() => {
    if (!connection) return;
    return useAuthStore.subscribe((state, previous) => {
      if (state.tokens?.accessToken !== previous.tokens?.accessToken) connection.tokenChanged();
    });
  }, [connection]);

  return <RealtimeContext.Provider value={connection}>{children}</RealtimeContext.Provider>;
}

const subscribeNever = () => () => undefined;

/** Whether the socket is up right now. False without one (no URL, mock mode, signed out): poll as before. */
export function useRealtimeConnected(): boolean {
  const connection = useContext(RealtimeContext);
  return useSyncExternalStore(
    connection ? (notify) => connection.onStatus(notify) : subscribeNever,
    () => connection?.status === "connected",
    () => false,
  );
}

/**
 * Listens to `destination` while mounted (null: not now). The listener may change on every render; the subscription
 * does not.
 */
export function useRealtimeSubscription(destination: string | null, listener: RealtimeListener) {
  const connection = useContext(RealtimeContext);
  const latest = useRef(listener);
  useEffect(() => {
    latest.current = listener;
  });
  useEffect(() => {
    if (!connection || !destination) return;
    return connection.subscribe(destination, (payload) => latest.current(payload));
  }, [connection, destination]);
}
