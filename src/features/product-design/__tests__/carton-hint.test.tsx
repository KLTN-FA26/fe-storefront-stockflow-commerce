import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders, signIn, signOut } from "@/test/render";

import { QuoteRequestDialog } from "../components/quote-request-dialog";
import { ids } from "./fixtures";

// SF-UX-9: the request counts cartons, a buyer thinks in pieces. The dialog says how many pieces a
// carton holds, and what the typed cartons come to, when the design carries its carton spec.

beforeEach(() => signIn());
afterEach(() => {
  vi.restoreAllMocks();
  signOut();
});

const renderDialog = (unitsPerCarton?: number) =>
  renderWithProviders(
    <QuoteRequestDialog
      design={{
        id: ids.design,
        name: "Ly giấy logo quán",
        ...(unitsPerCarton ? { unitsPerCarton } : {}),
      }}
      current={null}
      open
      onOpenChange={() => undefined}
    />,
  );

describe("the quote request's cartons in pieces (SF-UX-9)", () => {
  it("says how many pieces a carton holds and counts the typed cartons in pieces", async () => {
    const user = userEvent.setup();
    renderDialog(1000);
    const cartons = screen.getByLabelText("Số thùng mong muốn");
    expect(screen.getByText("1 thùng = 1.000 cái")).toBeInTheDocument();
    expect(cartons).toHaveAccessibleDescription(/1 thùng = 1\.000 cái/);

    await user.type(cartons, "50");
    expect(screen.getByText("1 thùng = 1.000 cái · 50 thùng = 50.000 cái")).toBeInTheDocument();
  });

  it("says nothing of pieces without the carton spec", () => {
    renderDialog();
    expect(screen.queryByText(/1 thùng =/)).not.toBeInTheDocument();
  });
});

describe("the quote request dialog's close button", () => {
  it("has a Vietnamese accessible name, apart from the footer's buttons", () => {
    renderDialog();
    expect(screen.getByRole("button", { name: "Đóng hộp thoại" })).toBeInTheDocument();
  });
});
