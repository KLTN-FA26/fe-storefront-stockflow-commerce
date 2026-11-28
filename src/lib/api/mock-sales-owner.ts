/**
 * Mock routes for the customer's Sales and the change requests (`/customers/me/sales-owner`, `/sales-options`,
 * `/sales-owner-change-requests`) and the public lead form (`POST /public/leads`), over one book per page
 * (mock-fixtures/sales-owner.ts).
 */

import { registerMockRoute } from "./mock-adapter";
import {
  createMockSalesOwnerBook,
  mockLeadResponse,
  type MockSalesOwnerBook,
} from "./mock-fixtures/sales-owner";

let book: MockSalesOwnerBook | undefined;
const salesOwner = () => (book ??= createMockSalesOwnerBook());

/** Test hook: start again from the seed (or from the given book). */
export function resetMockSalesOwner(next?: MockSalesOwnerBook): void {
  book = next;
}

const respond = ({ status, data }: { status: number; data: unknown }) => ({
  status,
  data,
  headers: {},
});

export function registerSalesOwnerMockRoutes(): void {
  registerMockRoute("GET", "/customers/me/sales-owner", () => respond(salesOwner().owner()));
  registerMockRoute("GET", "/customers/me/sales-options", () => respond(salesOwner().options()));
  registerMockRoute("GET", "/customers/me/sales-owner-change-requests", () =>
    respond(salesOwner().requests()),
  );
  registerMockRoute("POST", "/customers/me/sales-owner-change-requests", (config) =>
    respond(salesOwner().request(config.data)),
  );
  registerMockRoute("POST", "/public/leads", (config) => respond(mockLeadResponse(config.data)));
}
