/**
 * Mock routes for the customer's contract of an order: GET /orders/me/{orderId}/contract and
 * GET /orders/me/{orderId}/contract/document (plan Phụ lục A.2, customer view), over one book per
 * page (mock-fixtures/contracts.ts) on the seeded orders. The chat mock reads the same book through
 * `mockContractCardPayload` for its CONTRACT cards.
 */

import type { AxiosRequestConfig } from "axios";

import { registerMockRoute } from "./mock-adapter";
import { MOCK_CUSTOMER_ID } from "./mock-customer-addresses";
import {
  createMockContractBook,
  mockSentContract,
  mockSignedContract,
  type MockContractBook,
} from "./mock-fixtures/contracts";
import { seedMockOrders, type MockResult } from "./mock-fixtures/orders";
import { MOCK_CONTRACT_ORDER_IDS } from "./mock-fixtures/wf02";

/** The demo customer's contracts over the seeded orders (the order mock seeds the same orders). */
export function createDefaultMockContractBook(now = new Date()): MockContractBook {
  const orders = seedMockOrders(MOCK_CUSTOMER_ID);
  const orderOf = (orderId: string) => orders.find((order) => order.orderId === orderId);
  const sentOrder = orderOf(MOCK_CONTRACT_ORDER_IDS.sent);
  const signedOrder = orderOf(MOCK_CONTRACT_ORDER_IDS.signed);
  return createMockContractBook(MOCK_CUSTOMER_ID, orderOf, [
    ...(sentOrder ? [mockSentContract(sentOrder, now)] : []),
    ...(signedOrder ? [mockSignedContract(signedOrder)] : []),
  ]);
}

let book: MockContractBook | undefined;
const contracts = () => (book ??= createDefaultMockContractBook());

/** Test hook: start again from the seed (or from the given book). */
export function resetMockContracts(next?: MockContractBook): void {
  book = next;
}

/** The CONTRACT card payload (plan B.7.4) of an order's contract; null when it has none sent. */
export function mockContractCardPayload(orderId: string): Record<string, unknown> | null {
  return contracts().cardPayload(orderId);
}

const respond = (result: MockResult) => ({ status: result.status, data: result.data, headers: {} });

const orderIdOf = (config: AxiosRequestConfig) =>
  (config as AxiosRequestConfig & { _mockParams?: Record<string, string> })._mockParams?.orderId ??
  "";

const copyOf = (config: AxiosRequestConfig): string | undefined => {
  const copy = (config.params as { copy?: unknown } | undefined)?.copy;
  return typeof copy === "string" ? copy : undefined;
};

export function registerContractMockRoutes(): void {
  const bodyOf = (config: AxiosRequestConfig): Record<string, unknown> => {
    const data: unknown = typeof config.data === "string" ? JSON.parse(config.data) : config.data;
    return data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  };
  const ok = (data: unknown) => ({ status: 200, data: { success: true, data }, headers: {} });
  const paramsOf = (config: AxiosRequestConfig) =>
    (config as AxiosRequestConfig & { _mockParams?: Record<string, string> })._mockParams ?? {};
  registerMockRoute("POST", "/orders/me/:orderId/contract/sign/otp", (config) =>
    respond(contracts().otp(orderIdOf(config))),
  );
  registerMockRoute("POST", "/orders/me/:orderId/contract/sign", (config) => {
    const body = bodyOf(config);
    return respond(
      contracts().customerSign(orderIdOf(config), {
        version: Number(body.version),
        otp: String(body.otp ?? ""),
        signerName: String(body.signerName ?? ""),
        signerTitle: String(body.signerTitle ?? ""),
        consent: body.consent === true,
      }),
    );
  });
  registerMockRoute("POST", "/orders/me/:orderId/contract/change-request", (config) => {
    const body = bodyOf(config);
    return respond(
      contracts().changeRequest(orderIdOf(config), Number(body.version), String(body.reason ?? "")),
    );
  });
  registerMockRoute("POST", "/orders/me/:orderId/contract/sign/upload", async (config) => {
    const body: unknown = config.data;
    const file = body instanceof FormData ? body.get("file") : null;
    // Mock-only inspection: malformed PDFs exercise the refusal; valid PDF fixtures act as scans.
    if (
      !(body instanceof FormData) ||
      !(file instanceof Blob) ||
      file.size > 20 * 1024 * 1024 ||
      !(await file.text()).startsWith("%PDF-")
    )
      return {
        status: 422,
        data: {
          success: false,
          errorCode: "CONTRACT_SIGNED_FILE_REJECTED",
          details: { reason: "MALFORMED" },
        },
        headers: {},
      };
    return respond(
      contracts().customerSign(
        orderIdOf(config),
        {
          version: Number(body.get("version")),
          signerName: String(body.get("signerName") ?? ""),
          signerTitle: String(body.get("signerTitle") ?? ""),
        },
        true,
      ),
    );
  });
  registerMockRoute("GET", "/orders/me/:orderId/contract/revisions", (config) =>
    respond(contracts().revisions(orderIdOf(config))),
  );
  registerMockRoute("GET", "/orders/me/:orderId/contract/revisions/:revision/document", (config) =>
    respond(contracts().revisionDocument(orderIdOf(config), Number(paramsOf(config).revision))),
  );
  registerMockRoute("GET", "/orders/me/:orderId/contract/signature-page", (config) =>
    respond(contracts().signaturePage(orderIdOf(config))),
  );
  registerMockRoute("GET", "/public/contract-verifications/:code", (config) =>
    respond(contracts().verify(paramsOf(config).code ?? "")),
  );
  registerMockRoute("POST", "/public/contract-verifications/:code/check", async (config) => {
    const result = contracts().verify(paramsOf(config).code ?? "");
    if (result.status !== 200) return respond(result);
    const body: unknown = config.data;
    const file = body instanceof FormData ? body.get("file") : null;
    if (!(file instanceof Blob))
      return { status: 422, data: { success: false, errorCode: "VALIDATION_ERROR" }, headers: {} };
    const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
    const hash = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    return ok({
      matches: hash === "4f1949e95440af0ece666ebd5f399c1d77d22de639950784d349fa5feb47dca5",
    });
  });
  registerMockRoute("GET", "/orders/me/:orderId/contract", (config) =>
    respond(contracts().get(orderIdOf(config))),
  );
  registerMockRoute("GET", "/orders/me/:orderId/contract/document", (config) =>
    respond(contracts().document(orderIdOf(config), copyOf(config))),
  );
}
