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
import { returnFormSchema, returnableLines } from "../return-form";
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
