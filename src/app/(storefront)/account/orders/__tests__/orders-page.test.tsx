import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { UseMutationResult } from "@tanstack/react-query";
import { makeQueryClient } from "@/lib/api/query-client";
import type { ApiError } from "@/lib/api/error";

// Mock the order hooks
vi.mock("@/features/order", async () => {
  const actual = await vi.importActual("@/features/order");
  return {
    ...actual,
    useMyOrders: vi.fn(),
    useOrder: vi.fn(),
    useCancelMyOrder: vi.fn(),
  };
});

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
  useParams: () => ({ id: "ORD-2026-0019" }),
  notFound: vi.fn(),
}));

// Mock next/link
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// Mock lucide-react: keep actual exports, stub icon components
vi.mock("lucide-react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    ...Object.fromEntries(
      Object.keys(actual ?? {})
        .filter((name) => typeof name === "string")
        .map((name) => [name, () => <span data-testid={`icon-${name}`} />]),
    ),
  };
});

import { useMyOrders, useOrder, useCancelMyOrder } from "@/features/order";
import OrdersPage from "@/app/(storefront)/account/orders/page";
import OrderDetailPage from "@/app/(storefront)/account/orders/[id]/page";

const mockUseMyOrders = vi.mocked(useMyOrders);
const mockUseOrder = vi.mocked(useOrder);
const mockUseCancelMyOrder = vi.mocked(useCancelMyOrder);

function QueryWrapper({ children }: { children: ReactNode }) {
  const client: QueryClient = makeQueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseCancelMyOrder.mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
  } as unknown as UseMutationResult<void, ApiError, { id: string; reason?: string }>);
});

describe("OrdersPage", () => {
  it("shows loading skeletons", () => {
    mockUseMyOrders.mockReturnValue({ isLoading: true } as unknown as ReturnType<
      typeof useMyOrders
    >);
    render(<OrdersPage />, { wrapper: QueryWrapper });
    expect(screen.getAllByRole("generic").length).toBeGreaterThan(0);
  });

  it("shows empty state when no orders", () => {
    mockUseMyOrders.mockReturnValue({
      isLoading: false,
      data: { items: [], total: 0, page: 1, pageSize: 10 },
    } as unknown as ReturnType<typeof useMyOrders>);
    render(<OrdersPage />, { wrapper: QueryWrapper });
    expect(screen.getByText("Bạn chưa có đơn hàng nào")).toBeInTheDocument();
  });

  it("renders OrderCard for each order", () => {
    const mockOrders = [
      {
        orderId: "ORD-2026-0019",
        orderNumber: "ORD-2026-0019",
        status: "Completed",
        lines: [{ lineId: "L1" }],
        grandTotal: 348840,
        placedAt: "2026-05-26T10:00:00+07:00",
      },
      {
        orderId: "ORD-2026-0007",
        orderNumber: "ORD-2026-0007",
        status: "Shipped",
        lines: [{ lineId: "L2" }, { lineId: "L3" }],
        grandTotal: 656240,
        placedAt: "2026-06-08T07:00:00+07:00",
      },
    ];
    mockUseMyOrders.mockReturnValue({
      isLoading: false,
      data: { items: mockOrders, total: 2, page: 1, pageSize: 10 },
    } as unknown as ReturnType<typeof useMyOrders>);
    render(<OrdersPage />, { wrapper: QueryWrapper });
    expect(screen.getByText("ORD-2026-0019")).toBeInTheDocument();
    expect(screen.getByText("ORD-2026-0007")).toBeInTheDocument();
    expect(screen.getAllByText("Chi tiết").length).toBe(2);
  });
});

describe("OrderDetailPage", () => {
  it("shows loading skeleton", () => {
    mockUseOrder.mockReturnValue({ isLoading: true } as unknown as ReturnType<typeof useOrder>);
    render(<OrderDetailPage />, { wrapper: QueryWrapper });
    expect(screen.getAllByRole("generic").length).toBeGreaterThan(0);
  });

  it("hides cancel button when order is Shipped", () => {
    mockUseOrder.mockReturnValue({
      isLoading: false,
      data: {
        orderId: "ORD-2026-0007",
        orderNumber: "ORD-2026-0007",
        status: "Shipped",
        placedAt: "2026-06-08T07:00:00+07:00",
        lines: [{ lineId: "L1" }],
        grandTotal: 656240,
      },
    } as unknown as ReturnType<typeof useOrder>);
    render(<OrderDetailPage />, { wrapper: QueryWrapper });
    expect(screen.queryByText("Huỷ đơn hàng")).not.toBeInTheDocument();
  });

  it("shows cancel button when order is Pending Payment", () => {
    mockUseOrder.mockReturnValue({
      isLoading: false,
      data: {
        orderId: "ORD-2026-0020",
        orderNumber: "ORD-2026-0020",
        status: "Pending Payment",
        placedAt: "2026-06-12T10:00:00+07:00",
        lines: [{ lineId: "L1" }],
        grandTotal: 200000,
      },
    } as unknown as ReturnType<typeof useOrder>);
    render(<OrderDetailPage />, { wrapper: QueryWrapper });
    expect(screen.getByText("Huỷ đơn hàng")).toBeInTheDocument();
  });
});
