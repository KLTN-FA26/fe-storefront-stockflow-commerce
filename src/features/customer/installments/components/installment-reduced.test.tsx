import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { beInstallment } from "@/lib/installments/__tests__/fixtures";
import { installmentDtoSchema } from "@/lib/installments/schemas";
import { OrderInstallmentRow } from "@/features/order/components/order-installment-row";

import { MyInstallmentRow } from "./my-installment-row";

/** audit r2 money L-5: đợt đã được giảm (đóng phần còn lại, hàng trả / hoàn về) nói rõ số đã giảm. */
const reduced = installmentDtoSchema.parse(
  beInstallment({
    amount: 75_600_000,
    paidAmount: 0,
    reducedAmount: 37_800_000,
    outstanding: 37_800_000,
    status: "DUE",
    milestone: "AFTER_DELIVERY",
  }),
);
const plain = installmentDtoSchema.parse(beInstallment({ reducedAmount: 0 }));

describe("installment rows — reducedAmount", () => {
  it("account page row shows “Đã giảm” only when the installment was reduced", () => {
    const { rerender } = render(
      <ul>
        <MyInstallmentRow installment={reduced} />
      </ul>,
    );
    expect(screen.getByText("Đã giảm").nextElementSibling).toHaveTextContent(/37\.800\.000/);
    rerender(
      <ul>
        <MyInstallmentRow installment={plain} />
      </ul>,
    );
    expect(screen.queryByText("Đã giảm")).not.toBeInTheDocument();
  });

  it("order page row says how much was taken off", () => {
    render(
      <ul>
        <OrderInstallmentRow installment={reduced} open={false} onOpenChange={() => {}} />
      </ul>,
    );
    expect(screen.getByText(/do đóng phần hàng chưa giao/)).toHaveTextContent(/37\.800\.000/);
  });
});
