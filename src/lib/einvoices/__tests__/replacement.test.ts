import { describe, expect, it } from "vitest";

import { customerEInvoiceDtoSchema } from "../schemas";
import { replacementOf } from "../selectors";
import { beInvoice } from "./fixtures";

const invoice = (over: Record<string, unknown>) => customerEInvoiceDtoSchema.parse(beInvoice(over));

describe("replacementOf (BE EInvoice.drawUpReplacement: same order and shipment)", () => {
  const original = invoice({ status: "REPLACED" });
  const first = invoice({
    id: "5e1a0000-0000-4000-8000-000000000002",
    type: "REPLACEMENT",
    status: "REPLACED",
    issueDate: "2026-11-12",
    issuedAt: "2026-11-12T03:00:00Z",
  });
  const second = invoice({
    id: "5e1a0000-0000-4000-8000-000000000003",
    type: "REPLACEMENT",
    issueDate: "2026-11-14",
    issuedAt: "2026-11-14T03:00:00Z",
  });
  const otherShipment = invoice({
    id: "5e1a0000-0000-4000-8000-000000000004",
    type: "REPLACEMENT",
    shipmentCode: "SO-20260907-000431-S2",
    issueDate: "2026-11-11",
    issuedAt: "2026-11-11T03:00:00Z",
  });
  const all = [original, first, second, otherShipment];

  it("follows a chain of replacements one step at a time", () => {
    expect(replacementOf(original, all)?.id).toBe(first.id);
    expect(replacementOf(first, all)?.id).toBe(second.id);
  });

  it("has none for an invoice in force, or when the replacement is not listed", () => {
    expect(replacementOf(second, all)).toBeUndefined();
    expect(replacementOf(original, [original, otherShipment])).toBeUndefined();
  });
});
