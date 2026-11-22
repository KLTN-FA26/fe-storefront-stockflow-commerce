import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { OrderDeliveryCard } from "../components/order-detail-sections";
import { orderDtoSchema } from "../schemas";
import { beOrder } from "./fixtures";

const orderWith = (over: Record<string, unknown>) => orderDtoSchema.parse({ ...beOrder, ...over });

describe("delivery card (every order ships as a full truckload, SF-UX-33)", () => {
  it("shows no delivery-method row, whatever mode the BE still sends", () => {
    render(
      <OrderDeliveryCard
        order={orderWith({
          deliveryMode: "PARCEL",
          shipments: [{ status: "HANDED_OVER", packageCount: 2, deliveryMode: "PARCEL" }],
        })}
      />,
    );
    expect(screen.getByRole("heading", { name: "Giao hàng" })).toBeInTheDocument();
    expect(screen.queryByText(/Phương thức giao/)).not.toBeInTheDocument();
    expect(screen.queryByText("Giao lẻ")).not.toBeInTheDocument();
    expect(screen.queryByText("Đang chờ điều phối")).not.toBeInTheDocument();
  });
});
