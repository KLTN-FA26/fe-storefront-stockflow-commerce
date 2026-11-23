/**
 * Picks a day on the shared `DatePicker` the way a person does: open it, choose the year and month
 * in the calendar's dropdowns, click the day of that month.
 */

import { screen, waitFor, within } from "@testing-library/react";
import { expect } from "vitest";

import type { UserEvent } from "@testing-library/user-event";

export async function pickDate(user: UserEvent, trigger: HTMLElement, iso: string) {
  const [year, month] = iso.split("-").map(Number);
  await user.click(trigger);
  await user.selectOptions(await screen.findByRole("combobox", { name: "Chọn năm" }), String(year));
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Chọn tháng" }),
    String(month! - 1),
  );
  // The cell of that very day (a gridcell's data-day is yyyy-MM-dd), once the redrawn month shows it and it can be
  // picked: on a loaded runner the previous month can still be on screen, and a click there picks nothing.
  const button = await waitFor(() => {
    const found = within(screen.getByRole("grid"))
      .getAllByRole("gridcell")
      .find((c) => c.getAttribute("data-day") === iso && !c.hasAttribute("data-outside"))
      ?.querySelector("button");
    if (!found || found.disabled) throw new Error(`No day ${iso} on the calendar`);
    return found;
  });
  await user.click(button);
  // Picking a day closes the calendar; the caller may keep the value anywhere, so wait for that, not for the text.
  await waitFor(() => expect(screen.queryByRole("grid")).not.toBeInTheDocument());
}
