import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useAuthStore } from "@/lib/auth/auth-store";
import { signIn, signOut } from "@/test/render";

import {
  RealtimeProvider,
  useRealtimeConnected,
  useRealtimeSubscription,
} from "./realtime-provider";
import { RealtimeConnection } from "./stomp-connection";

function Probe() {
  useRealtimeSubscription("/topic/a", () => undefined);
  return <p>{useRealtimeConnected() ? "live" : "polling"}</p>;
}

afterEach(() => {
  vi.restoreAllMocks();
  signOut();
});

describe("RealtimeProvider", () => {
  it("opens no socket without NEXT_PUBLIC_WS_URL: everything stays on polling", () => {
    render(
      <RealtimeProvider enabled url="">
        <Probe />
      </RealtimeProvider>,
    );
    expect(screen.getByText("polling")).toBeInTheDocument();
  });

  it("reconnects with the new token after a new sign-in", () => {
    const connection = new RealtimeConnection({
      url: "ws://test/ws",
      getToken: () => null,
      socketFactory: vi.fn(),
    });
    const tokenChanged = vi.spyOn(connection, "tokenChanged");
    render(
      <RealtimeProvider enabled connection={connection}>
        <Probe />
      </RealtimeProvider>,
    );
    act(() => signIn());
    expect(tokenChanged).toHaveBeenCalledTimes(1);
    act(() => useAuthStore.setState({ user: null }));
    expect(tokenChanged).toHaveBeenCalledTimes(1); // the token did not change
  });
});
