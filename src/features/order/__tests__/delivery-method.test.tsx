import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { OrderDeliveryCard } from "../components/order-detail-sections";
import { orderDtoSchema } from "../schemas";
import { deliveryModes } from "../selectors";
import { beOrder } from "./fixtures";

const orderWith = (over: Record<string, unknown>) => orderDtoSchema.parse({ ...beOrder, ...over });
const shipment = (deliveryMode?: string) => ({
  status: "HANDED_OVER",
  packageCount: 2,
  handedOverAt: "2026-09-08T03:00:00Z",
  ...(deliveryMode ? { deliveryMode } : {}),
});

describe("delivery mode (read-only, the coordinator's choice)", () => {
  it("reads the mode off the shipments, each once, and ignores a mode newer than this FE", () => {
    expect(deliveryModes(orderWith({}))).toEqual([]);
    expect(
      deliveryModes(orderWith({ shipments: [shipment("PARCEL"), shipment("PARCEL")] })),
    ).toEqual(["PARCEL"]);
    expect(
      deliveryModes(orderWith({ shipments: [shipment("PARCEL"), shipment("FULL_TRUCKLOAD")] })),
    ).toEqual(["PARCEL", "FULL_TRUCKLOAD"]);
    expect(deliveryModes(orderWith({ shipments: [shipment("DRONE")] }))).toEqual(["UNKNOWN"]);
  });

  it("shows Giao lẻ", () => {
    render(<OrderDeliveryCard order={orderWith({ shipments: [shipment("PARCEL")] })} />);
    expect(screen.getByText("Phương thức giao:")).toBeInTheDocument();
    expect(screen.getByText("Giao lẻ")).toBeInTheDocument();
  });

  it("shows Xe nguyên chuyến", () => {
    render(<OrderDeliveryCard order={orderWith({ shipments: [shipment("FULL_TRUCKLOAD")] })} />);
    expect(screen.getByText("Xe nguyên chuyến")).toBeInTheDocument();
  });

  it("says awaiting coordination when no shipment carries a mode", () => {
    render(<OrderDeliveryCard order={orderWith({ shipments: [shipment()] })} />);
    expect(screen.getByText("Đang chờ điều phối")).toBeInTheDocument();
  });

  it("says awaiting coordination before anything is handed over, and on an older BE without shipments", () => {
    const { unmount } = render(<OrderDeliveryCard order={orderWith({ shipments: [] })} />);
    expect(screen.getByText("Đang chờ điều phối")).toBeInTheDocument();
    unmount();
    render(<OrderDeliveryCard order={orderWith({})} />);
    expect(screen.getByText("Đang chờ điều phối")).toBeInTheDocument();
  });

  it("says nothing on a cancelled order with nothing to coordinate, and offers no way to change it", () => {
    render(
      <OrderDeliveryCard order={orderWith({ status: "CANCELLED", statusGroup: "CANCELLED" })} />,
    );
    expect(screen.queryByText("Phương thức giao:")).not.toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });
});
