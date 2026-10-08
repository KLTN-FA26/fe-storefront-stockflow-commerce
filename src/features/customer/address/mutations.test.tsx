import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/error";

import { useDeleteAddress } from "./mutations";
import { customerAddressKeys } from "./queries";

afterEach(() => vi.restoreAllMocks());

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, invalidate, wrapper };
}

const input = { customerId: "CUS-0010", addressId: "6f1c2a3b-4d5e-4f60-8a71-0b2c3d4e5f60" };

describe("address mutations keep the list in sync", () => {
  it("re-reads the list after a successful delete", async () => {
    vi.spyOn(api, "delete").mockResolvedValueOnce({ data: null, status: 204 });
    const { queryClient, invalidate, wrapper } = setup();
    queryClient.setQueryData(customerAddressKeys.customerId(), input.customerId);
    const { result } = renderHook(() => useDeleteAddress(), { wrapper });

    result.current.mutate(input);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: customerAddressKeys.lists() });
    // customerId never changes for a session: no extra GET /customers/me after a mutation.
    expect(queryClient.getQueryState(customerAddressKeys.customerId())?.isInvalidated).toBe(false);
  });

  it("re-reads the list when the address was already removed elsewhere (404)", async () => {
    vi.spyOn(api, "delete").mockRejectedValueOnce(
      new ApiError(404, "ADDRESS_NOT_FOUND", "Address not found"),
    );
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useDeleteAddress(), { wrapper });

    result.current.mutate(input);

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: customerAddressKeys.lists() });
  });
});
