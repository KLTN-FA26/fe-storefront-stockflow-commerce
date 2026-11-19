import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderWithProviders } from "@/test/render";

import { DesignCard } from "../components/design-card";
import { design, ids } from "./fixtures";

// WF-02 audit item 10: a customer opens a chat about one design (BE C1 with the DESIGN context).
describe("Chat với Sale on a design card", () => {
  it("an approved design opens the conversation about that design", () => {
    renderWithProviders(<DesignCard design={design({ name: "Ly sáng", status: "APPROVED" })} />);
    expect(screen.getByRole("link", { name: "Chat với Sale về Ly sáng" })).toHaveAttribute(
      "href",
      `/chat/new?kind=DESIGN&id=${ids.design}`,
    );
  });

  it("a plain draft Sales has never seen offers no chat", () => {
    renderWithProviders(<DesignCard design={design({ name: "Ly nháp", status: "DRAFT" })} />);
    expect(screen.queryByRole("link", { name: /Chat với Sale/ })).not.toBeInTheDocument();
  });
});
