/**
 * Picks a day on the shared `DatePicker` the way a person does: open it, choose the year and month
 * in the calendar's dropdowns, click the day of that month.
 */

import { screen, within } from "@testing-library/react";

import type { UserEvent } from "@testing-library/user-event";

export async function pickDate(user: UserEvent, trigger: HTMLElement, iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  await user.click(trigger);
  await user.selectOptions(await screen.findByRole("combobox", { name: "Chọn năm" }), String(year));
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Chọn tháng" }),
    String(month! - 1),
  );
  const cell = within(screen.getByRole("grid"))
    .getAllByRole("gridcell")
    .find((c) => c.textContent === String(day) && !c.hasAttribute("data-outside"));
  if (!cell) throw new Error(`No day ${iso} on the calendar`);
  await user.click(within(cell).getByRole("button"));
}
