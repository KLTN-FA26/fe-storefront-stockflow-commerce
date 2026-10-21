import { PAYMENT_TERMS, type CheckoutPaymentTerm, type PaymentTermsDto } from "./checkout-schemas";

/** What the checkout shows and sends for one payment term. */
export interface PaymentTermOption {
  term: CheckoutPaymentTerm;
  label: string;
  description: string;
}

/** The terms the customer may use, the one to preselect, and the deposit share. */
export interface PaymentTermChoice {
  options: PaymentTermOption[];
  defaultTerm: CheckoutPaymentTerm;
  depositPercent: number | undefined;
}

const isTerm = (value: string): value is CheckoutPaymentTerm =>
  (PAYMENT_TERMS as readonly string[]).includes(value);

// kltn-docs 15-payment §4: prepaid confirms on full payment; a deposit confirms the order and releases
// it to production; credit is paid after delivery. The credit limit is back-office data and is never shown.
function describe(
  term: CheckoutPaymentTerm,
  depositPercent: number | undefined,
): PaymentTermOption {
  switch (term) {
    case "PREPAID":
      return {
        term,
        label: "Trả trước 100%",
        description:
          "Chuyển khoản toàn bộ giá trị đơn. Đơn được xác nhận khi chúng tôi đã nhận đủ tiền.",
      };
    case "DEPOSIT":
      return {
        term,
        label: depositPercent ? `Đặt cọc ${depositPercent}%` : "Đặt cọc",
        description: `Chuyển khoản tiền cọc${
          depositPercent ? ` (${depositPercent}% giá trị đơn)` : ""
        } để đơn được xác nhận và bắt đầu sản xuất. Phần còn lại thanh toán theo thoả thuận của tài khoản.`,
      };
    case "CREDIT":
      return {
        term,
        label: "Công nợ",
        description:
          "Đặt hàng trước, thanh toán sau theo kỳ hạn đã thoả thuận. Đơn vượt hạn mức công nợ sẽ chờ duyệt.",
      };
  }
}

/**
 * The customer's allowed terms as the checkout offers them, in the BE's order. A term this FE does
 * not know is dropped (it could not be sent), the default falls back to the first allowed term when
 * it is missing or not allowed, and `undefined` means no known term at all: the checkout then
 * sends none and the BE applies the customer's default.
 */
export function resolvePaymentTerms(dto: PaymentTermsDto): PaymentTermChoice | undefined {
  const allowed = PAYMENT_TERMS.filter((term) => dto.allowedTerms.includes(term));
  const first = allowed[0];
  if (!first) return undefined;
  const requested = dto.defaultTerm && isTerm(dto.defaultTerm) ? dto.defaultTerm : undefined;
  const depositPercent = dto.depositPercent ?? undefined;
  return {
    options: allowed.map((term) => describe(term, depositPercent)),
    defaultTerm: requested && allowed.includes(requested) ? requested : first,
    depositPercent,
  };
}

/** The deposit the BE will ask for: the share of the total, rounded to whole VND as the BE does. */
export const depositAmount = (total: number, depositPercent: number) =>
  Math.round((total * depositPercent) / 100);
