import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { NuqsTestingAdapter, type OnUrlUpdateFunction } from "nuqs/adapters/testing";
import type { ReactNode } from "react";

import { useAuthStore } from "@/lib/auth/auth-store";
import { useCartStore } from "@/lib/store/use-cart-store";

/** Screens read the session from the auth store, like the app: sign in / out around a test. */
export function signIn() {
  useAuthStore.setState({
    user: {
      userId: "user-1",
      fullName: "Khách",
      email: "k@example.vn",
      roles: [],
      warehouseIds: [],
    },
    tokens: { accessToken: "token", tokenType: "Bearer", expiresInSeconds: 3600 },
    isAuthenticated: true,
  });
}

export function signOut() {
  useAuthStore.setState({ user: null, tokens: null, isAuthenticated: false });
}

export function resetCart() {
  useCartStore.setState({ ownerId: null, lines: [] });
}

/** App providers for a screen test: a fresh query cache that never retries, and nuqs URL state. */
export function renderWithProviders(
  ui: ReactNode,
  opts: { searchParams?: string; onUrlUpdate?: OnUrlUpdateFunction } = {},
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <NuqsTestingAdapter
        hasMemory
        searchParams={opts.searchParams ?? ""}
        {...(opts.onUrlUpdate ? { onUrlUpdate: opts.onUrlUpdate } : {})}
      >
        {ui}
      </NuqsTestingAdapter>
    </QueryClientProvider>,
  );
  return { ...view, client };
}
