import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { QuantityStepper } from "../quantity-stepper";

function Harness({ min = 1, max }: { min?: number; max?: number }) {
  const [value, setValue] = useState(min);
  return <QuantityStepper value={value} min={min} max={max} onChange={setValue} />;
}
const field = () => screen.getByRole("textbox", { name: "Số lượng" });

describe("QuantityStepper", () => {
  it("steps by one and stops at the minimum", async () => {
    render(<Harness min={2} />);
    expect(screen.getByRole("button", { name: "Giảm số lượng" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Tăng số lượng" }));
    expect(field()).toHaveValue("3");
    await userEvent.click(screen.getByRole("button", { name: "Giảm số lượng" }));
    expect(field()).toHaveValue("2");
  });

  it("takes a typed wholesale quantity on Enter or blur", async () => {
    render(<Harness />);
    await userEvent.clear(field());
    await userEvent.type(field(), "12000{Enter}");
    expect(field()).toHaveValue("12000");
    await userEvent.clear(field());
    await userEvent.type(field(), "3");
    await userEvent.tab();
    expect(field()).toHaveValue("3");
  });

  it("clamps what is typed to min..max and ignores anything that is not a number", async () => {
    render(<Harness min={10} max={50} />);
    await userEvent.clear(field());
    await userEvent.type(field(), "5{Enter}");
    expect(field()).toHaveValue("10");
    await userEvent.clear(field());
    await userEvent.type(field(), "999{Enter}");
    expect(field()).toHaveValue("50");
    await userEvent.clear(field());
    await userEvent.type(field(), "abc{Enter}");
    expect(field()).toHaveValue("50"); // nothing numeric: the committed value stays
    expect(screen.getByRole("button", { name: "Tăng số lượng" })).toBeDisabled();
  });
});
