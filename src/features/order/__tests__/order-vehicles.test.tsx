import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/error";
import { renderWithProviders, signIn, signOut } from "@/test/render";

import { getOrderVehicles } from "../api";
import { OrderVehiclesCard } from "../components/order-vehicles-card";
import { orderVehiclesDtoSchema } from "../schemas";
import { orderId } from "./fixtures";

const vehicle = {
  loadCode: "LD-20261110-0001",
  carrierName: "Vận tải Minh Phát",
  waybillNo: "MP-998877",
  vehiclePlate: "51C-123.45",
  handedOverAt: "2026-11-10T03:00:00Z",
  milestones: [
    { milestone: "PICKED_UP", at: "2026-11-10T04:00:00Z" },
    { milestone: "IN_TRANSIT", at: "2026-11-10T06:00:00Z" },
  ],
  shipments: [{ shipmentCode: "SH-0001", status: "HANDED_OVER" }],
};

beforeEach(() => signIn());
afterEach(() => {
  vi.restoreAllMocks();
  signOut();
});

describe("order vehicles API + schema", () => {
  it("calls the fulfillment customer endpoint and parses the vehicles", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValueOnce({ data: [vehicle] });
    const result = await getOrderVehicles(orderId);
    expect(get).toHaveBeenCalledWith(`/fulfillment/orders/me/${orderId}/vehicles`, {});
    expect(result[0]).toMatchObject({ carrierName: "Vận tải Minh Phát", waybillNo: "MP-998877" });
  });

  it("accepts omitted fields and maps an unknown milestone to UNKNOWN", () => {
    const [v] = orderVehiclesDtoSchema.parse([
      { loadCode: "LD-1", milestones: [{ milestone: "TELEPORTED", at: "2026-11-10T04:00:00Z" }] },
    ]);
    expect(v?.carrierName).toBeUndefined();
    expect(v?.milestones?.[0]?.milestone).toBe("UNKNOWN");
  });

  it("rejects a malformed payload (contract break)", () => {
    expect(() => orderVehiclesDtoSchema.parse({ not: "a list" })).toThrow();
  });
});

describe("OrderVehiclesCard", () => {
  it("shows carrier, waybill, plate, milestones and shipment status per vehicle", async () => {
    vi.spyOn(api, "get").mockResolvedValue({
      data: [vehicle, { ...vehicle, loadCode: "LD-2", waybillNo: "MP-2", vehiclePlate: "51D-1" }],
    });
    renderWithProviders(<OrderVehiclesCard orderId={orderId} />);
    expect(await screen.findByText("Xe 1")).toBeInTheDocument();
    expect(screen.getByText("Xe 2")).toBeInTheDocument();
    expect(screen.getAllByText("Vận tải Minh Phát")).toHaveLength(2);
    expect(screen.getByText("MP-998877")).toBeInTheDocument();
    expect(screen.getByText("51C-123.45")).toBeInTheDocument();
    expect(screen.getAllByText("Đã lấy hàng").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Đang giao").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Đã bàn giao vận chuyển").length).toBeGreaterThan(0);
  });

  it("says 'Đang cập nhật' for a missing waybill or plate", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ data: [{ loadCode: "LD-1" }] });
    renderWithProviders(<OrderVehiclesCard orderId={orderId} />);
    expect(await screen.findByText("Mã vận đơn:")).toBeInTheDocument();
    expect(screen.getAllByText("Đang cập nhật")).toHaveLength(3);
  });

  it("shows a loading skeleton first", () => {
    vi.spyOn(api, "get").mockReturnValue(new Promise(() => {}));
    renderWithProviders(<OrderVehiclesCard orderId={orderId} />);
    expect(
      screen.getByRole("status", { name: "Đang tải thông tin vận chuyển" }),
    ).toBeInTheDocument();
  });

  it("renders nothing when no vehicle has left yet", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValue({ data: [] });
    const { container } = renderWithProviders(<OrderVehiclesCard orderId={orderId} />);
    await vi.waitFor(() => expect(get).toHaveBeenCalled());
    await vi.waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
    expect(container).toBeEmptyDOMElement();
  });

  it("shows a retryable notice when the request fails", async () => {
    vi.spyOn(api, "get").mockRejectedValue(new ApiError(403, "FORBIDDEN", "Missing permission"));
    renderWithProviders(<OrderVehiclesCard orderId={orderId} />);
    expect(await screen.findByText("Chưa tải được thông tin vận chuyển")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Thử lại" })).toBeInTheDocument();
  });
});
