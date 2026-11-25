import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { renderWithProviders } from "@/test/render";

import { DesignCard } from "../components/design-card";
import { design, ids } from "./fixtures";

// WF-02 audit item 10: a customer opens a chat about one design (BE C1 with the DESIGN context).
describe("Chat với Sale on a design card", () => {
  it("an approved design opens the conversation about that design", async () => {
    renderWithProviders(<DesignCard design={design({ name: "Ly sáng", status: "APPROVED" })} />);
    await userEvent.click(screen.getByRole("button", { name: /Thao tác khác/ }));
    expect(
      await screen.findByRole("menuitem", { name: "Chat với Sale về Ly sáng" }),
    ).toHaveAttribute("href", `/chat/new?kind=DESIGN&id=${ids.design}`);
  });

  it("a plain draft opens the conversation about that design too (Q7: as the BE)", async () => {
    renderWithProviders(<DesignCard design={design({ name: "Ly nháp", status: "DRAFT" })} />);
    await userEvent.click(screen.getByRole("button", { name: /Thao tác khác/ }));
    expect(
      await screen.findByRole("menuitem", { name: "Chat với Sale về Ly nháp" }),
    ).toHaveAttribute("href", `/chat/new?kind=DESIGN&id=${ids.design}`);
  });
});
