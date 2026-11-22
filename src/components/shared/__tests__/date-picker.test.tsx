import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { pickDate } from "@/test/date-picker";

import { DatePicker } from "../DatePicker";

function Harness({
  initial = "",
  onChange = () => {},
  ...props
}: Partial<React.ComponentProps<typeof DatePicker>> & { initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <label htmlFor="d">Ngày giao</label>
      <DatePicker
        id="d"
        value={value}
        onChange={(next) => {
          setValue(next);
          onChange(next);
        }}
        {...props}
      />
    </>
  );
}

const nextYear = new Date().getFullYear() + 1;

describe("DatePicker (dd/MM/yyyy, SF-UX-3)", () => {
  it("shows a placeholder, then the chosen day as dd/MM/yyyy, and hands back YYYY-MM-DD", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const trigger = screen.getByLabelText("Ngày giao");
    expect(trigger).toHaveTextContent("Chọn ngày");

    await pickDate(user, trigger, `${nextYear}-03-05`);
    expect(onChange).toHaveBeenLastCalledWith(`${nextYear}-03-05`);
    expect(trigger).toHaveTextContent(`05/03/${nextYear}`);
    expect(screen.queryByRole("grid")).not.toBeInTheDocument();
  });

  it("dims and disables the days before `min`", async () => {
    const user = userEvent.setup();
    render(<Harness initial={`${nextYear}-03-15`} min={`${nextYear}-03-10`} />);
    await user.click(screen.getByLabelText("Ngày giao"));
    const cells = screen.getAllByRole("gridcell");
    const day = (n: string) =>
      cells.find((c) => c.textContent === n && !c.hasAttribute("data-outside"));
    expect(day("9")?.querySelector("button")).toBeDisabled();
    expect(day("10")?.querySelector("button")).toBeEnabled();
  });

  it("clears an optional day back to empty", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness initial={`${nextYear}-03-15`} clearable onChange={onChange} />);
    await user.click(screen.getByLabelText("Ngày giao"));
    await user.click(screen.getByRole("button", { name: "Xoá ngày" }));
    expect(onChange).toHaveBeenLastCalledWith("");
    expect(screen.getByLabelText("Ngày giao")).toHaveTextContent("Chọn ngày");
  });

  it("puts aria-invalid on the button that opens the calendar", () => {
    render(<Harness aria-invalid />);
    expect(screen.getByLabelText("Ngày giao")).toHaveAttribute("aria-invalid", "true");
  });
});
