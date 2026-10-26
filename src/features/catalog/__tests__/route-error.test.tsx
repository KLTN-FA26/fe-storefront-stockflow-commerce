import {
  QueryClient,
  QueryClientProvider,
  QueryErrorResetBoundary,
  useQueryErrorResetBoundary,
} from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CatalogRouteError } from "../components/route-error";

describe("CatalogRouteError", () => {
  it("clears the failed queries before re-rendering the route", async () => {
    const reset = vi.fn();
    let boundary: ReturnType<typeof useQueryErrorResetBoundary> | undefined;
    function Probe() {
      boundary = useQueryErrorResetBoundary();
      return null;
    }
    render(
      <QueryClientProvider client={new QueryClient()}>
        <QueryErrorResetBoundary>
          <CatalogRouteError
            title="Tìm kiếm"
            heading="Không tìm kiếm được sản phẩm"
            error={new Error("boom")}
            reset={reset}
          />
          <Probe />
        </QueryErrorResetBoundary>
      </QueryClientProvider>,
    );

    expect(screen.getByText("Không tìm kiếm được sản phẩm")).toBeInTheDocument();
    expect(boundary?.isReset()).toBe(false);
    await userEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(boundary?.isReset()).toBe(true);
    expect(reset).toHaveBeenCalledOnce();
  });
});
