import { describe, expect, it } from "vitest";

import { customerEInvoiceDtoSchema } from "../schemas";
import { beInvoice } from "./fixtures";

const ORIGINAL = { id: "5e1a0000-0000-4000-8000-000000000001", code: "EINV-20261110-0001" };
const REPLACEMENT = { id: "5e1a0000-0000-4000-8000-000000000002", code: "EINV-20261112-0003" };

describe("replacement chain (BE CustomerEInvoiceResponse.replaces / replacedBy, TT 91 Điều 10)", () => {
  it("reads the invoice a replacement replaces, and the one that replaced a replaced invoice", () => {
    const replaced = customerEInvoiceDtoSchema.parse(
      beInvoice({ status: "REPLACED", replacedBy: REPLACEMENT }),
    );
    expect(replaced.replacedBy).toEqual(REPLACEMENT);
    expect(replaced.replaces).toBeUndefined();
    const replacement = customerEInvoiceDtoSchema.parse(
      beInvoice({ id: REPLACEMENT.id, type: "REPLACEMENT", replaces: ORIGINAL }),
    );
    expect(replacement.replaces).toEqual(ORIGINAL);
  });

  it("has no link while no replacement is issued (NON_NULL omits it, or sends null)", () => {
    expect(customerEInvoiceDtoSchema.parse(beInvoice({ status: "REPLACED" })).replacedBy).toBe(
      undefined,
    );
    expect(customerEInvoiceDtoSchema.parse(beInvoice({ replacedBy: null })).replacedBy).toBeNull();
  });

  it("refuses a link that does not name an invoice id", () => {
    expect(
      customerEInvoiceDtoSchema.safeParse(beInvoice({ replacedBy: { id: "x", code: "c" } }))
        .success,
    ).toBe(false);
  });
});
