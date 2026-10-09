import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

// API_BASE is read at module load, so each case re-imports the hook with its own env.
async function loadHook(apiUrl: string) {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_VIETNAM_PROVINCES_API_URL", apiUrl);
  return (await import("./use-vietnam-addresses")).useVietnamAddresses;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("useVietnamAddresses", () => {
  it("loads provinces from the URL configured in env", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([{ code: 79, name: "Thành phố Hồ Chí Minh" }])),
    );
    vi.stubGlobal("fetch", fetchMock);
    const useVietnamAddresses = await loadHook("https://provinces.test/api/v2");

    const { result } = renderHook(() => useVietnamAddresses(""), { wrapper });

    await waitFor(() =>
      expect(result.current.provinces).toEqual([{ value: "79", label: "Thành phố Hồ Chí Minh" }]),
    );
    expect(fetchMock).toHaveBeenCalledWith("https://provinces.test/api/v2");
    expect(result.current.error).toBeNull();
  });

  it("exposes an HTTP failure instead of an empty list", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 503 })));
    const useVietnamAddresses = await loadHook("https://provinces.test/api/v2");

    const { result } = renderHook(() => useVietnamAddresses(""), { wrapper });

    await waitFor(() => expect(result.current.error?.message).toContain("HTTP 503"));
  });

  it("fails clearly when the env variable is missing", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const useVietnamAddresses = await loadHook("");

    const { result } = renderHook(() => useVietnamAddresses(""), { wrapper });

    await waitFor(() =>
      expect(result.current.error?.message).toContain("NEXT_PUBLIC_VIETNAM_PROVINCES_API_URL"),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
