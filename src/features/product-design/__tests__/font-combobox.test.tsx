import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FontCombobox } from "../components/studio/font-combobox";
import type { FontOption } from "../components/studio/text-actions";

vi.mock("../components/studio/use-font-status", () => ({ useFontStatus: () => ({}) }));

const font = (n: number): FontOption => ({
  code: `f${n}`,
  label: `Phông ${n}`,
  family: `Phông ${n}`,
  italic: false,
});
const FEW = [font(1), font(2), font(3)];
const MANY = Array.from({ length: 9 }, (_, i) => font(i + 1));

function Harness({
  options,
  onPick,
}: {
  options: readonly FontOption[];
  onPick: (c: string) => void;
}) {
  const [value, setValue] = useState("f1");
  return (
    <FontCombobox
      label="Phông chữ"
      value={value}
      options={options}
      onChange={(code) => {
        setValue(code);
        onPick(code);
      }}
    />
  );
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => vi.restoreAllMocks());

describe("FontCombobox search field (UX audit S08-13)", () => {
  it("a short list hides the search field but the keyboard still works: arrows move, Enter picks", async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<Harness options={FEW} onPick={onPick} />);
    await user.click(screen.getByRole("combobox", { name: /^Phông chữ/ }));
    const listbox = await screen.findByRole("listbox");
    // not visible (screen-reader-only wrapper), but present so the list can be driven by keys
    const search = screen.getByPlaceholderText("Tìm phông chữ…");
    expect(search.closest("div")).toHaveClass("sr-only");
    expect(within(listbox).getAllByRole("option")).toHaveLength(3);
    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(["f2", "f3"]).toContain(onPick.mock.calls[0]?.[0]);
  });

  it("typing a name picks it without the field being shown", async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<Harness options={FEW} onPick={onPick} />);
    await user.click(screen.getByRole("combobox", { name: /^Phông chữ/ }));
    await screen.findByRole("listbox");
    await user.keyboard("Phông 3{Enter}");
    expect(onPick).toHaveBeenCalledWith("f3");
  });

  it("a long list shows the search field as before", async () => {
    const user = userEvent.setup();
    render(<Harness options={MANY} onPick={vi.fn()} />);
    await user.click(screen.getByRole("combobox", { name: /^Phông chữ/ }));
    await screen.findByRole("listbox");
    expect(screen.getByPlaceholderText("Tìm phông chữ…").closest("div")).not.toHaveClass("sr-only");
  });
});
