import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api/client";
import { beInvoice } from "@/lib/einvoices/__tests__/fixtures";
import { renderWithProviders, signIn, signOut } from "@/test/render";

import { EInvoiceLinkScreen } from "../components/einvoice-link-screen";

const replace = vi.fn();
const notFound = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  notFound: () => notFound(),
}));

const page = (items: unknown[]) => ({
  items,
  page: 0,
  size: 200,
  totalElements: items.length,
  totalPages: 1,
  hasNext: false,
  hasPrevious: false,
});

beforeEach(() => signIn());
afterEach(() => {
  vi.restoreAllMocks();
  replace.mockReset();
  notFound.mockReset();
  signOut();
});

describe("EInvoiceLinkScreen — BE notification link /einvoices/{id} (WF-05 SF-06)", () => {
  it("opens the invoices card of the invoice's order", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ data: page([beInvoice()]) });
    renderWithProviders(<EInvoiceLinkScreen id={beInvoice().id} />);
    await vi.waitFor(() =>
      expect(replace).toHaveBeenCalledWith(
        `/account/orders/${beInvoice().orderId}#order-invoices-heading`,
      ),
    );
  });

  it("is not found for an invoice that is not the customer's", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ data: page([beInvoice()]) });
    renderWithProviders(<EInvoiceLinkScreen id="5e1a0000-0000-4000-8000-0000000000ff" />);
    await vi.waitFor(() => expect(notFound).toHaveBeenCalled());
    expect(replace).not.toHaveBeenCalled();
  });
});
