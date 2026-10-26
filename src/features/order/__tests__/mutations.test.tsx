import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/error";

import { useCancelMyOrder } from "../mutations";
import { orderKeys } from "../queries";
import { orderId } from "./fixtures";

afterEach(() => vi.restoreAllMocks());

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { invalidate, wrapper };
}

const expectListAndDetailInvalidated = (invalidate: ReturnType<typeof setup>["invalidate"]) => {
  expect(invalidate).toHaveBeenCalledWith({ queryKey: orderKeys.lists() });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: orderKeys.detail(orderId) });
};

describe("useCancelMyOrder keeps the list and the order in sync", () => {
  it("re-reads list and detail after a successful cancellation", async () => {
    vi.spyOn(api, "post").mockResolvedValueOnce({ data: { result: "CANCELLED" } });
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useCancelMyOrder(), { wrapper });

    result.current.mutate({ orderId });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expectListAndDetailInvalidated(invalidate);
  });

  it.each([
    [409, "CONFLICT"],
    [404, "NOT_FOUND"],
  ])(
    "re-reads list and detail when the BE answers %i %s (cache is stale)",
    async (status, code) => {
      vi.spyOn(api, "post").mockRejectedValueOnce(new ApiError(status, code, "stale"));
      const { invalidate, wrapper } = setup();
      const { result } = renderHook(() => useCancelMyOrder(), { wrapper });

      result.current.mutate({ orderId });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expectListAndDetailInvalidated(invalidate);
    },
  );
});
