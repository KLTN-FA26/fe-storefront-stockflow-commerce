import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it } from "vitest";

import { ColorField, useRecentColors } from "../components/studio/color-field";
import { PRINT_SWATCHES, type Hex } from "../engine";

beforeEach(() => useRecentColors.setState({ colors: [] }));

const KRAFT_WARNING = "Giấy kraft không in được màu trắng.";

/** A ColorField over its own state, reporting every value it hands out. */
function Harness({
  initial = "#111111",
  warnOnKraft,
  seen,
}: {
  initial?: Hex;
  warnOnKraft?: boolean;
  seen: Hex[];
}) {
  const [value, setValue] = useState<Hex>(initial);
  return (
    <ColorField
      label="Màu chữ"
      value={value}
      {...(warnOnKraft === undefined ? {} : { warnOnKraft })}
      onChange={(next) => {
        seen.push(next);
        setValue(next);
      }}
    />
  );
}

const group = () => within(screen.getByRole("group", { name: "Màu chữ" }));
const hexInput = () => group().getByRole("textbox", { name: "Mã màu (#RRGGBB)" });
const swatchButtons = () => group().getAllByRole("button");

describe("ColorField", () => {
  it("offers the print swatches and marks the current colour", async () => {
    const user = userEvent.setup();
    const seen: Hex[] = [];
    render(<Harness initial="#2563EB" seen={seen} />);

    expect(swatchButtons()).toHaveLength(PRINT_SWATCHES.length);
    expect(group().getByRole("button", { name: /#2563EB/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await user.click(group().getByRole("button", { name: /#DC2626/ }));

    expect(seen).toEqual(["#DC2626"]);
    expect(group().getByRole("button", { name: /#DC2626/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(group().getByRole("button", { name: /#2563EB/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("makes every swatch a 44 px touch target drawn in its own colour", () => {
    render(<Harness seen={[]} />);

    for (const button of swatchButtons()) {
      expect(button).toHaveClass("size-11");
    }
    expect(group().getByRole("button", { name: /#16A34A/ })).toHaveStyle({
      backgroundColor: "#16A34A",
    });
  });

  it("takes a #RRGGBB code, with or without the #, in either case", async () => {
    const user = userEvent.setup();
    const seen: Hex[] = [];
    render(<Harness seen={seen} />);

    await user.clear(hexInput());
    await user.type(hexInput(), "ff8800");
    await user.tab();
    expect(seen).toEqual(["#FF8800"]);
    expect(hexInput()).toHaveValue("#FF8800");

    await user.clear(hexInput());
    await user.type(hexInput(), "#00aa55");
    expect(seen.at(-1)).toBe("#00AA55");
  });

  it("refuses an incomplete or invalid code and restores the colour on leaving", async () => {
    const user = userEvent.setup();
    const seen: Hex[] = [];
    render(<Harness initial="#111111" seen={seen} />);

    await user.clear(hexInput());
    await user.type(hexInput(), "#12G");
    expect(hexInput()).toHaveAttribute("aria-invalid", "true");
    expect(group().getByText("Nhập mã màu dạng #RRGGBB.")).toBeInTheDocument();
    await user.tab();

    expect(seen).toEqual([]);
    expect(hexInput()).toHaveValue("#111111");
    expect(hexInput()).not.toHaveAttribute("aria-invalid", "true");
  });

  // Eight rounds of clear, paste and tab: over 5 s in a loaded full run.
  it("remembers the six most recent custom colours of the session, newest first", async () => {
    const user = userEvent.setup();
    render(<Harness seen={[]} />);

    for (const digit of ["1", "2", "3", "4", "5", "6", "7"]) {
      await user.clear(hexInput());
      await user.paste(`#${digit.repeat(6)}`);
      await user.tab();
    }

    const names = swatchButtons().map((b) => b.getAttribute("aria-label"));
    expect(names.slice(PRINT_SWATCHES.length)).toEqual([
      "#777777",
      "#666666",
      "#555555",
      "#444444",
      "#333333",
      "#222222",
    ]);
    // The same colour again moves up instead of repeating; a print swatch is never "recent".
    await user.clear(hexInput());
    await user.paste("#333333");
    await user.tab();
    await user.click(group().getByRole("button", { name: /#DC2626/ }));
    const after = swatchButtons().map((b) => b.getAttribute("aria-label"));
    expect(after.slice(PRINT_SWATCHES.length, PRINT_SWATCHES.length + 2)).toEqual([
      "#333333",
      "#777777",
    ]);
    expect(after).toHaveLength(PRINT_SWATCHES.length + 6);
  }, 15_000);

  it("shares recent colours between fields and keeps them out of storage", async () => {
    const user = userEvent.setup();
    const before = localStorage.length;
    render(
      <>
        <Harness seen={[]} />
        <ColorField label="Màu viền" value="#000000" onChange={() => {}} />
      </>,
    );

    await user.clear(hexInput());
    await user.type(hexInput(), "#abcdef");
    await user.tab();

    const outline = within(screen.getByRole("group", { name: "Màu viền" }));
    expect(outline.getByRole("button", { name: "#ABCDEF" })).toBeInTheDocument();
    expect(localStorage.length).toBe(before);
  });

  it("warns about near-white colours where kraft is asked about", async () => {
    const user = userEvent.setup();
    render(<Harness initial="#FFFFFF" warnOnKraft seen={[]} />);

    expect(screen.getByText(KRAFT_WARNING)).toBeInTheDocument();
    await user.click(group().getByRole("button", { name: /#000000/ }));
    expect(screen.queryByText(KRAFT_WARNING)).not.toBeInTheDocument();
    // The preflight rule's threshold: relative luminance above 0.92.
    await user.clear(hexInput());
    await user.type(hexInput(), "#F5F5F5");
    expect(screen.queryByText(KRAFT_WARNING)).not.toBeInTheDocument();
    await user.clear(hexInput());
    await user.type(hexInput(), "#F8F8F8");
    expect(screen.getByText(KRAFT_WARNING)).toBeInTheDocument();
  });

  it("does not warn without warnOnKraft", () => {
    render(<Harness initial="#FFFFFF" seen={[]} />);

    expect(screen.queryByText(KRAFT_WARNING)).not.toBeInTheDocument();
  });
});
