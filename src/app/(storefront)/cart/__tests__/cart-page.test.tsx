import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import CartPage from "../page";

describe("CartPage", () => {
  it("blocks checkout while a line is unavailable", () => {
    render(<CartPage />);

    expect(screen.getByRole("button", { name: /Tiếp tục checkout/ })).toBeDisabled();
    expect(screen.getByText("Có sản phẩm đang chặn checkout")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Tiếp tục checkout/ })).toBeNull();
  });
});
