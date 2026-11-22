import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NewDesignAction } from "../components/new-design-action";

afterEach(() => vi.unstubAllGlobals());

/** `window.matchMedia` as a window `width` px wide answers it (jsdom has none); a mouse, no touch. */
function stubWidth(width: number) {
  vi.stubGlobal("matchMedia", (query: string) => {
    const range = /^\(max-width:\s*([\d.]+)rem\)$/.exec(query);
    return {
      matches: range ? width <= Number(range[1]) * 16 : false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    };
  });
}

describe("'Thiết kế mới' on the design list (SF-UX-8)", () => {
  it("on a phone, is locked and says up front that design needs a computer, with the link to copy", () => {
    stubWidth(375);
    const onCreate = vi.fn();
    render(<NewDesignAction onCreate={onCreate} />);

    const button = screen.getByRole("button", { name: "Thiết kế mới" });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription(/chỉ làm được trên máy tính/);
    expect(screen.getByRole("button", { name: "Sao chép liên kết" })).toBeInTheDocument();
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("on a computer, opens the product dialog and says nothing more", async () => {
    stubWidth(1440);
    const onCreate = vi.fn();
    render(<NewDesignAction onCreate={onCreate} />);

    await userEvent.setup().click(screen.getByRole("button", { name: "Thiết kế mới" }));
    expect(onCreate).toHaveBeenCalledOnce();
    expect(screen.queryByText(/chỉ làm được trên máy tính/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sao chép liên kết" })).not.toBeInTheDocument();
  });
});
