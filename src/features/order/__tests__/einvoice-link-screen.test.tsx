import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/error";
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

describe("EInvoiceLinkScreen — BE notification link /einvoices/{id} (WF-05 SF-06, BE-60)", () => {
  it("reads the invoice by id and opens its order's invoices card", async () => {
    const get = vi.spyOn(api, "get").mockImplementation(async (url: string) => {
      if (url === `/einvoices/me/${beInvoice().id}`) return { data: beInvoice() };
      throw new ApiError(404, "NOT_FOUND", url);
    });
    renderWithProviders(<EInvoiceLinkScreen id={beInvoice().id} />);
    await vi.waitFor(() =>
      expect(replace).toHaveBeenCalledWith(
        `/account/orders/${beInvoice().orderId}#order-invoices-heading`,
      ),
    );
    // F-19: no scan of the newest 200 any more, so an older invoice is found too.
    expect(get).not.toHaveBeenCalledWith("/einvoices/me", expect.anything());
  });

  it("is not found for an invoice that is not the customer's", async () => {
    const get = vi.spyOn(api, "get").mockImplementation(async (url: string) => {
      throw new ApiError(404, "EINVOICE_NOT_FOUND", url);
    });
    renderWithProviders(<EInvoiceLinkScreen id="5e1a0000-0000-4000-8000-0000000000ff" />);
    await vi.waitFor(() => expect(notFound).toHaveBeenCalled());
    expect(replace).not.toHaveBeenCalled();
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("falls back to the newest invoices on a BE without the single-invoice endpoint", async () => {
    vi.spyOn(api, "get").mockImplementation(async (url: string) => {
      if (url === "/einvoices/me") return { data: page([beInvoice()]) };
      // Spring's answer to an unmapped path: the generic code, not EINVOICE_NOT_FOUND.
      throw new ApiError(404, "NOT_FOUND", url);
    });
    renderWithProviders(<EInvoiceLinkScreen id={beInvoice().id} />);
    await vi.waitFor(() =>
      expect(replace).toHaveBeenCalledWith(
        `/account/orders/${beInvoice().orderId}#order-invoices-heading`,
      ),
    );
  });

  it("asks nothing for an id that is not one", async () => {
    const get = vi.spyOn(api, "get");
    renderWithProviders(<EInvoiceLinkScreen id="not-an-id" />);
    await vi.waitFor(() => expect(notFound).toHaveBeenCalled());
    expect(get).not.toHaveBeenCalled();
  });
});
