import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/error";
import { customerReturnDtoSchema } from "@/lib/returns";
import { beReturn, RETURN_ID } from "@/lib/returns/__tests__/fixtures";
import { renderWithProviders, signIn, signOut } from "@/test/render";

import { OrderHelpCard } from "../components/order-help-card";
import { ReturnRequestScreen } from "../components/return-request-screen";
import { quantitiesFor, returnFormSchema, returnableLines } from "../return-form";
import { orderDtoSchema } from "../schemas";
import { beOrder, orderId } from "./fixtures";

const push = vi.hoisted(() => vi.fn());
const notFound = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }), notFound: () => notFound() }));

const TEE = "1a2b3c4d-0000-4000-8000-000000000001";
const MUG = "1a2b3c4d-0000-4000-8000-000000000002"; // in theo thiết kế
const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();
const delivered = (days = 1) => ({
  ...beOrder,
  status: "DELIVERED",
  statusGroup: "DELIVERED",
  deliveryState: "DELIVERED",
  timeline: [
    ...beOrder.timeline,
    { status: "DELIVERED", statusGroup: "DELIVERED", occurredAt: daysAgo(days) },
  ],
});
const emptyPage = {
  items: [],
  page: 0,
  size: 100,
  totalElements: 0,
  totalPages: 0,
  hasNext: false,
  hasPrevious: false,
};

function backend(order: unknown, permissions = ["sales-rmas:CREATE", "sales-rmas:READ"]) {
  vi.spyOn(api, "get").mockImplementation(async (url: string) => {
    if (url === "/identity/me/permissions")
      return { data: { roles: ["CUSTOMER"], permissions, dataScope: "OWN" } };
    if (url === `/orders/me/${orderId}`) return { data: order };
    if (url === "/returns/me") return { data: emptyPage };
    throw new ApiError(404, "NOT_FOUND", url);
  });
}

beforeEach(() => signIn());
afterEach(() => {
  vi.restoreAllMocks();
  push.mockClear();
  signOut();
});

describe("return form rules (BE ReturnRequest.open)", () => {
  const order = orderDtoSchema.parse(delivered());
  const held = customerReturnDtoSchema.parse(
    beReturn({
      status: "RESOLVED",
      lines: [{ ...beReturn().lines[0], orderLineId: TEE, refundQuantity: 1 }],
    }),
  );
  const lines = returnableLines(order.lines, [held]);
  const photo = new File(["x"], "a.jpg", { type: "image/jpeg" });
  const valid = {
    quantities: { [TEE]: 1, [MUG]: 0 },
    reasonCode: "DAMAGED_IN_TRANSIT" as const,
    description: "",
    photos: [photo],
  };

  it("leaves what other returns hold out of what can still be returned", () => {
    expect(lines.find((l) => l.lineId === TEE)).toMatchObject({ delivered: 2, claimed: 1, max: 1 });
    expect(lines.find((l) => l.lineId === MUG)).toMatchObject({ printed: true, max: 1 });
  });

  it("needs a line, a photo, at most what is left, and a text for OTHER", () => {
    const schema = returnFormSchema(lines);
    expect(schema.safeParse(valid).success).toBe(true);
    const paths = (values: unknown) =>
      (schema.safeParse(values).error?.issues ?? []).map((issue) => issue.path.join("."));
    expect(paths({ ...valid, quantities: { [TEE]: 0 } })).toContain("quantities");
    expect(paths({ ...valid, quantities: { [TEE]: 2 } })).toContain(`quantities.${TEE}`);
    expect(paths({ ...valid, photos: [] })).toContain("photos");
    expect(paths({ ...valid, reasonCode: "OTHER" })).toContain("description");
  });

  it("takes printed goods back only for a named fault (BR-RMA-002)", () => {
    const schema = returnFormSchema(lines);
    const result = schema.safeParse({
      ...valid,
      quantities: { [MUG]: 1 },
      reasonCode: "OTHER",
      description: "Không thích",
    });
    expect(result.error?.issues.map((issue) => issue.path.join("."))).toContain("reasonCode");
  });
});

describe("per-shipment limits (BE CustomerOrderShipmentLine.returnableQuantity, WF-05 TH-1)", () => {
  const order = orderDtoSchema.parse(delivered());
  const S1 = "5e000000-0000-4000-8000-000000000001";
  const onS1 = [
    { orderLineId: TEE, quantity: 1, returnableQuantity: 1 },
    { orderLineId: MUG, quantity: 1, returnableQuantity: 0 },
  ];

  it("bounds each line by what the chosen shipment may still return, not the whole order", () => {
    const lines = returnableLines(order.lines, [], { shipmentId: S1, lines: onS1 });
    expect(lines.find((l) => l.lineId === TEE)).toMatchObject({ delivered: 1, max: 1 });
    // 0 locks the line ("Không trả thêm được").
    expect(lines.find((l) => l.lineId === MUG)).toMatchObject({ delivered: 1, max: 0 });
  });

  it("offers only the lines the shipment carried", () => {
    const lines = returnableLines(order.lines, [], {
      shipmentId: S1,
      lines: [{ orderLineId: TEE, quantity: 2, returnableQuantity: 2 }],
    });
    expect(lines.map((l) => l.lineId)).toEqual([TEE]);
  });

  it("falls back to the whole order when the BE sends no shipment lines", () => {
    const lines = returnableLines(order.lines, [], { shipmentId: S1 });
    expect(lines.map((l) => [l.lineId, l.max])).toEqual([
      [TEE, 2],
      [MUG, 1],
    ]);
  });

  it("keeps what still fits after the shipment changes, and drops the rest", () => {
    const lines = returnableLines(order.lines, [], {
      shipmentId: S1,
      lines: [
        { orderLineId: TEE, quantity: 2, returnableQuantity: 1 },
        { orderLineId: MUG, quantity: 1, returnableQuantity: 0 },
      ],
    });
    expect(quantitiesFor(lines, { [TEE]: 2, [MUG]: 1, other: 3 })).toEqual({ [TEE]: 1, [MUG]: 0 });
    expect(quantitiesFor(lines)).toEqual({ [TEE]: 0, [MUG]: 0 });
  });
});

describe("ReturnRequestScreen (kltn-docs 17 §4.10)", () => {
  it("opens the return, sends its photo and goes to the return's page", async () => {
    backend(delivered());
    const post = vi.spyOn(api, "post").mockImplementation(async (url: string) => ({
      data: beReturn({ status: "REQUESTED", orderId }),
      url,
    }));
    renderWithProviders(<ReturnRequestScreen orderId={orderId} />);

    const teeRow = (await screen.findByText("TEE-CLASSIC-WHT-M")).closest("li")!;
    await userEvent.click(within(teeRow).getByRole("button", { name: "Tăng số lượng" }));
    await userEvent.click(screen.getByRole("radio", { name: /Hư hỏng khi vận chuyển/ }));
    await userEvent.upload(
      screen.getByLabelText("Ảnh chụp lỗi hoặc hư hỏng"),
      new File(["x"], "mop.jpg", { type: "image/jpeg" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Gửi yêu cầu trả hàng" }));

    await vi.waitFor(() => expect(push).toHaveBeenCalledWith(`/account/returns/${RETURN_ID}`));
    const [openUrl, body] = post.mock.calls[0]!;
    expect(openUrl).toBe(`/orders/${orderId}/returns`);
    expect(body).toMatchObject({
      reasonCode: "DAMAGED_IN_TRANSIT",
      requestedResolution: "REFUND",
      lines: [{ orderLineId: TEE, quantity: 1 }],
    });
    expect(post.mock.calls[1]?.[0]).toBe(`/returns/${RETURN_ID}/evidence`);
  });

  it("asks for a photo before anything is sent", async () => {
    backend(delivered());
    const post = vi.spyOn(api, "post");
    renderWithProviders(<ReturnRequestScreen orderId={orderId} />);
    const teeRow = (await screen.findByText("TEE-CLASSIC-WHT-M")).closest("li")!;
    await userEvent.click(within(teeRow).getByRole("button", { name: "Tăng số lượng" }));
    await userEvent.click(screen.getByRole("radio", { name: /Giao sai hàng/ }));
    await userEvent.click(screen.getByRole("button", { name: "Gửi yêu cầu trả hàng" }));
    expect(await screen.findByText("Thêm ít nhất 1 ảnh cho thấy vấn đề.")).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it("explains that the 7-day window has passed", async () => {
    backend(delivered(10));
    renderWithProviders(<ReturnRequestScreen orderId={orderId} />);
    expect(
      await screen.findByText("Không thể gửi yêu cầu trả hàng cho đơn này"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Gửi yêu cầu trả hàng" })).toBeNull();
  });
});

describe("ReturnRequestScreen — an order delivered in several shipments (WF-05 TH-1)", () => {
  const S1 = "5e000000-0000-4000-8000-000000000001";
  const S2 = "5e000000-0000-4000-8000-000000000002";
  const shipment = (shipmentId: string | null, n: number, days: number) => ({
    shipmentId,
    shipmentCode: `SO-20261002-000436-S${n}`,
    status: "DELIVERED",
    packageCount: 1,
    handedOverAt: daysAgo(days + 1),
    outcomeAt: daysAgo(days),
  });

  it("asks which delivery the goods came on and sends its shipmentId", async () => {
    backend({ ...delivered(), shipments: [shipment(S1, 1, 3), shipment(S2, 2, 1)] });
    const post = vi.spyOn(api, "post").mockImplementation(async () => ({
      data: beReturn({ status: "REQUESTED", orderId, shipmentId: S2 }),
    }));
    renderWithProviders(<ReturnRequestScreen orderId={orderId} />);

    expect(await screen.findByText("Chọn lần giao ở trên để chọn sản phẩm.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: /Lần giao 2/ }));
    const teeRow = (await screen.findByText("TEE-CLASSIC-WHT-M")).closest("li")!;
    await userEvent.click(within(teeRow).getByRole("button", { name: "Tăng số lượng" }));
    await userEvent.click(screen.getByRole("radio", { name: /Giao sai hàng/ }));
    await userEvent.upload(
      screen.getByLabelText("Ảnh chụp lỗi hoặc hư hỏng"),
      new File(["x"], "sai.jpg", { type: "image/jpeg" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Gửi yêu cầu trả hàng" }));

    await vi.waitFor(() => expect(post).toHaveBeenCalled());
    expect(post.mock.calls[0]?.[1]).toMatchObject({
      shipmentId: S2,
      lines: [{ orderLineId: TEE, quantity: 1 }],
    });
  });

  it("keeps a delivery past its window out of reach", async () => {
    backend({ ...delivered(), shipments: [shipment(S1, 1, 10), shipment(S2, 2, 1)] });
    renderWithProviders(<ReturnRequestScreen orderId={orderId} />);
    expect(await screen.findByRole("radio", { name: /Lần giao 1/ })).toBeDisabled();
    // The only delivery still in its window is chosen for the customer.
    expect(screen.getByRole("radio", { name: /Lần giao 2/ })).toBeChecked();
  });

  it("opens a return on a delivered shipment while the next one is still on its way", async () => {
    backend({
      ...delivered(),
      status: "SHIPPED",
      statusGroup: "SHIPPING",
      shipments: [shipment(S1, 1, 1), { shipmentId: S2, status: "HANDED_OVER" }],
    });
    renderWithProviders(<ReturnRequestScreen orderId={orderId} />);
    expect(await screen.findByRole("button", { name: "Gửi yêu cầu trả hàng" })).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: /Lần giao/ })).toBeNull();
  });

  it("sends the customer to Sale when the deliveries carry no id", async () => {
    backend({ ...delivered(), shipments: [shipment(null, 1, 2), shipment(null, 2, 1)] });
    renderWithProviders(<ReturnRequestScreen orderId={orderId} />);
    expect(await screen.findByText(/Vui lòng liên hệ Sale/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Gửi yêu cầu trả hàng" })).toBeNull();
  });

  it("limits each line to the chosen delivery and refits the quantities when it changes", async () => {
    backend({
      ...delivered(),
      shipments: [
        {
          ...shipment(S1, 1, 3),
          lines: [
            { orderLineId: TEE, sku: "TEE-CLASSIC-WHT-M", quantity: 2, returnableQuantity: 2 },
            { orderLineId: MUG, sku: "MUG-CERAMIC-11OZ", quantity: 1, returnableQuantity: 0 },
          ],
        },
        {
          ...shipment(S2, 2, 1),
          lines: [
            { orderLineId: TEE, sku: "TEE-CLASSIC-WHT-M", quantity: 1, returnableQuantity: 1 },
          ],
        },
      ],
    });
    const post = vi.spyOn(api, "post").mockImplementation(async () => ({
      data: beReturn({ status: "REQUESTED", orderId, shipmentId: S2 }),
    }));
    renderWithProviders(<ReturnRequestScreen orderId={orderId} />);

    await userEvent.click(await screen.findByRole("radio", { name: /Lần giao 1/ }));
    expect(screen.getByText(/tính theo lần giao đã chọn/)).toBeInTheDocument();
    const mugRow = screen.getByText("MUG-CERAMIC-11OZ").closest("li")!;
    expect(within(mugRow).getByText("Không trả thêm được")).toBeInTheDocument();
    const teeRow = screen.getByText("TEE-CLASSIC-WHT-M").closest("li")!;
    await userEvent.click(within(teeRow).getByRole("button", { name: "Tăng số lượng" }));
    await userEvent.click(within(teeRow).getByRole("button", { name: "Tăng số lượng" }));
    expect(within(teeRow).getByRole("button", { name: "Tăng số lượng" })).toBeDisabled();

    // The second delivery brought no mug and one tee: the two chosen tees refit to that one.
    await userEvent.click(screen.getByRole("radio", { name: /Lần giao 2/ }));
    expect(screen.queryByText("MUG-CERAMIC-11OZ")).toBeNull();
    const teeOnS2 = screen.getByText("TEE-CLASSIC-WHT-M").closest("li")!;
    expect(within(teeOnS2).getByRole("button", { name: "Tăng số lượng" })).toBeDisabled();
    await userEvent.click(screen.getByRole("radio", { name: /Giao sai hàng/ }));
    await userEvent.upload(
      screen.getByLabelText("Ảnh chụp lỗi hoặc hư hỏng"),
      new File(["x"], "sai.jpg", { type: "image/jpeg" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Gửi yêu cầu trả hàng" }));
    await vi.waitFor(() => expect(post).toHaveBeenCalled());
    expect(post.mock.calls[0]?.[1]).toMatchObject({
      shipmentId: S2,
      lines: [{ orderLineId: TEE, quantity: 1 }],
    });
  });

  // SF-05: the BE's returnableQuantity decides, not the FE's own copy of the window.
  it("keeps a delivery the BE takes nothing more of out of reach, though its window is open", async () => {
    backend({
      ...delivered(),
      shipments: [
        {
          ...shipment(S1, 1, 2),
          lines: [
            { orderLineId: TEE, sku: "TEE-CLASSIC-WHT-M", quantity: 1, returnableQuantity: 0 },
          ],
        },
        {
          ...shipment(S2, 2, 1),
          lines: [
            { orderLineId: TEE, sku: "TEE-CLASSIC-WHT-M", quantity: 1, returnableQuantity: 1 },
          ],
        },
      ],
    });
    renderWithProviders(<ReturnRequestScreen orderId={orderId} />);
    const first = await screen.findByRole("radio", { name: /Lần giao 1/ });
    expect(first).toBeDisabled();
    expect(screen.getByText("Không còn sản phẩm nào trả được")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Lần giao 2/ })).toBeChecked();
  });

  it("offers a delivery the BE still takes back after the FE's 7-day count, with no past date", async () => {
    backend({
      ...delivered(),
      shipments: [
        {
          ...shipment(S1, 1, 10),
          lines: [
            { orderLineId: TEE, sku: "TEE-CLASSIC-WHT-M", quantity: 1, returnableQuantity: 1 },
          ],
        },
        {
          ...shipment(S2, 2, 9),
          lines: [
            { orderLineId: TEE, sku: "TEE-CLASSIC-WHT-M", quantity: 1, returnableQuantity: 0 },
          ],
        },
      ],
    });
    renderWithProviders(<ReturnRequestScreen orderId={orderId} />);
    const first = await screen.findByRole("radio", { name: /Lần giao 1/ });
    expect(first).toBeEnabled();
    expect(first).toBeChecked();
    expect(screen.getByText("Còn đổi / trả được")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Lần giao 2/ })).toBeDisabled();
    expect(screen.getByText("Đã quá hạn đổi / trả")).toBeInTheDocument();
  });

  it("says nothing is left to return when the BE takes no line of the only delivery", async () => {
    backend({
      ...delivered(),
      shipments: [
        {
          ...shipment(S1, 1, 1),
          lines: [
            { orderLineId: TEE, sku: "TEE-CLASSIC-WHT-M", quantity: 2, returnableQuantity: 0 },
          ],
        },
      ],
    });
    renderWithProviders(<ReturnRequestScreen orderId={orderId} />);
    expect(
      await screen.findByText(/Hiện không còn sản phẩm nào của đơn trả được/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Gửi yêu cầu trả hàng" })).toBeNull();
  });

  // Q-15: a refund settled on one delivery does not close the others still in their window.
  it("opens a return on another delivery of an order already partly refunded", async () => {
    backend({
      ...delivered(),
      status: "PARTIALLY_REFUNDED",
      statusGroup: "PARTIALLY_RETURNED",
      deliveryState: "PARTIALLY_RETURNED",
      shipments: [
        {
          ...shipment(S1, 1, 3),
          lines: [
            { orderLineId: TEE, sku: "TEE-CLASSIC-WHT-M", quantity: 1, returnableQuantity: 0 },
          ],
        },
        {
          ...shipment(S2, 2, 1),
          lines: [
            { orderLineId: TEE, sku: "TEE-CLASSIC-WHT-M", quantity: 1, returnableQuantity: 1 },
          ],
        },
      ],
    });
    renderWithProviders(<ReturnRequestScreen orderId={orderId} />);
    expect(await screen.findByRole("radio", { name: /Lần giao 2/ })).toBeChecked();
    expect(screen.getByRole("button", { name: "Gửi yêu cầu trả hàng" })).toBeInTheDocument();
  });

  it("shows the BE refusal of a missing delivery in Vietnamese", async () => {
    backend({ ...delivered(), shipments: [shipment(S1, 1, 1)] });
    vi.spyOn(api, "post").mockRejectedValue(
      new ApiError(422, "RETURN_SHIPMENT_REQUIRED", "Name the delivery"),
    );
    renderWithProviders(<ReturnRequestScreen orderId={orderId} />);
    const teeRow = (await screen.findByText("TEE-CLASSIC-WHT-M")).closest("li")!;
    await userEvent.click(within(teeRow).getByRole("button", { name: "Tăng số lượng" }));
    await userEvent.click(screen.getByRole("radio", { name: /Giao sai hàng/ }));
    await userEvent.upload(
      screen.getByLabelText("Ảnh chụp lỗi hoặc hư hỏng"),
      new File(["x"], "sai.jpg", { type: "image/jpeg" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Gửi yêu cầu trả hàng" }));
    expect(await screen.findByText(/hãy chọn lần giao có hàng muốn trả/)).toBeInTheDocument();
  });
});

describe("OrderHelpCard return button", () => {
  it("links to the return form when the order may be returned", () => {
    renderWithProviders(
      <OrderHelpCard
        order={orderDtoSchema.parse(delivered())}
        onCancel={() => undefined}
        mayCancel
        requestPending={false}
        returnHref={`/account/orders/${orderId}/return`}
      />,
    );
    expect(screen.getByRole("link", { name: "Yêu cầu trả hàng" })).toHaveAttribute(
      "href",
      `/account/orders/${orderId}/return`,
    );
  });
});
