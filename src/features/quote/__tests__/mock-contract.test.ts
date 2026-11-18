import { afterEach, describe, expect, it, vi } from "vitest";

import { contractDtoSchema } from "@/features/order/contract-schemas";
import type { MockResult } from "@/lib/api/mock-fixtures/orders";
import { MOCK_QUOTE_SEED_IDS as IDS } from "@/lib/api/mock-fixtures/quotes";
import { MOCK_CONTRACT_ORDER_IDS, onMockChatEvent } from "@/lib/api/mock-fixtures/wf02";

import { quoteDtoSchema, quotePageDtoSchema } from "../schemas";

// USE_MOCK must answer what the real BE answers, or the screens are tested against a fiction.
// The route handlers are captured from the registry, then called as the adapter would.
type Handler = (config: Record<string, unknown>) => { status: number; data: unknown };
const routes = new Map<string, Handler>();
vi.mock("@/lib/api/mock-adapter", () => ({
  registerMockRoute: (method: string, pattern: string, handler: Handler) =>
    routes.set(`${method} ${pattern}`, handler),
}));

const { registerQuoteMockRoutes, mockQuoteCardPayload, mockQuoteCardAction, resetMockQuotes } =
  await import("@/lib/api/mock-quotes");
const { registerContractMockRoutes, mockContractCardPayload } =
  await import("@/lib/api/mock-contracts");
registerQuoteMockRoutes();
registerContractMockRoutes();

const call = (route: string, config: Record<string, unknown> = {}) => {
  const handler = routes.get(route);
  if (!handler) throw new Error(`no route ${route}`);
  return handler(config);
};
const dataOf = (result: { data: unknown }) => (result.data as { data: unknown }).data;

afterEach(() => resetMockQuotes());

describe("quote and contract mocks satisfy the FE contract", () => {
  it("answers GET /quotes and /quotes/{id} with bodies the schemas accept", () => {
    expect(quotePageDtoSchema.safeParse(dataOf(call("GET /quotes", { params: {} }))).success).toBe(
      true,
    );
    for (const id of [IDS.sent, IDS.changesRequested, IDS.expired, IDS.converted]) {
      const parsed = quoteDtoSchema.safeParse(
        dataOf(call("GET /quotes/:id", { _mockParams: { id } })),
      );
      expect(parsed.success).toBe(true);
    }
  });

  it("answers GET /orders/me/{id}/contract with a body the contract schema accepts", () => {
    for (const orderId of Object.values(MOCK_CONTRACT_ORDER_IDS)) {
      const result = call("GET /orders/me/:orderId/contract", { _mockParams: { orderId } });
      expect(contractDtoSchema.safeParse(dataOf(result)).success).toBe(true);
    }
    expect(mockContractCardPayload(MOCK_CONTRACT_ORDER_IDS.sent)).toMatchObject({
      status: "SENT",
    });
  });

  it("tells the chat mock QUOTE_CHANGED after an answer on the quote page, not after a refusal", () => {
    const events: unknown[] = [];
    const stop = onMockChatEvent((event) => events.push(event));
    const quote = quoteDtoSchema.parse(
      dataOf(call("GET /quotes/:id", { _mockParams: { id: IDS.sent } })),
    );
    const refused: MockResult = call("POST /quotes/:id/acceptance", {
      _mockParams: { id: IDS.sent },
      data: JSON.stringify({
        version: quote.version,
        lines: [{ lineId: quote.lines[0]!.id, cartons: 1 }],
      }),
    });
    expect(refused.status).toBe(409);
    expect(events).toEqual([]);

    const accepted = call("POST /quotes/:id/acceptance", {
      _mockParams: { id: IDS.sent },
      data: JSON.stringify({ version: quote.version }),
    });
    expect(accepted.status).toBe(200);
    expect(events).toEqual([{ type: "QUOTE_CHANGED", quoteId: IDS.sent }]);
    stop();
    // The card reads the same quote the page answered.
    expect(mockQuoteCardPayload(IDS.sent)).toMatchObject({ status: "ACCEPTED" });
    expect(mockQuoteCardAction(IDS.sent, "ACCEPT", { version: 0 }).status).toBe(409);
  });
});
