import { creditSummary, type CreditSummary, type PaymentTermsDto } from "@/lib/payment-terms";

import {
  BALANCE_POLICIES,
  PAYMENT_TERMS,
  type BalancePolicy,
  type CheckoutPaymentTerm,
} from "./checkout-schemas";

/** What the checkout shows and sends for one payment term. */
export interface PaymentTermOption {
  term: CheckoutPaymentTerm;
  label: string;
  description: string;
}

/** How the balance of a deposit order can be paid, as the checkout words it. */
export interface BalancePolicyOption {
  policy: BalancePolicy;
  label: string;
  description: string;
}

/** The balance policies the customer may pick for a DEPOSIT order. */
export interface BalancePolicyChoice {
  options: BalancePolicyOption[];
  /** The customer's own policy when it is allowed and known; undefined means the BE's choice is not readable. */
  defaultPolicy: BalancePolicy | undefined;
}

/** The terms the customer may use, the one to preselect, and the deposit share. */
export interface PaymentTermChoice {
  options: PaymentTermOption[];
  defaultTerm: CheckoutPaymentTerm;
  depositPercent: number | undefined;
  /** The customer's own credit position (SFCREDIT); undefined without credit. */
  credit: CreditSummary | undefined;
  /** DEPOSIT only: how the balance may be paid; undefined when deposits or the choice are not offered. */
  balance: BalancePolicyChoice | undefined;
}

const isTerm = (value: string): value is CheckoutPaymentTerm =>
  (PAYMENT_TERMS as readonly string[]).includes(value);

// kltn-docs 15-payment §4: prepaid confirms on full payment; a deposit confirms the order and releases
// it to production; credit is paid after delivery, and the customer's own credit position is shown
// beside the CREDIT term (SFCREDIT).
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

// What each balance policy means for the customer (kltn-docs 15 §4: the deposit confirms the order,
// the balance is due at the time the policy says).
const BALANCE_OPTIONS: Record<BalancePolicy, BalancePolicyOption> = {
  BEFORE_DELIVERY: {
    policy: "BEFORE_DELIVERY",
    label: "Trả trước khi giao",
    description:
      "Chuyển khoản phần còn lại trước khi hàng được giao đi. Hàng chỉ xuất kho khi đã nhận đủ tiền.",
  },
  ON_DELIVERY: {
    policy: "ON_DELIVERY",
    label: "Trả khi nhận hàng",
    description: "Thanh toán phần còn lại cho đơn vị vận chuyển khi nhận hàng.",
  },
  ON_CREDIT: {
    policy: "ON_CREDIT",
    label: "Ghi vào công nợ",
    description:
      "Phần còn lại được ghi vào công nợ và thanh toán trong kỳ hạn đã thoả thuận, trong hạn mức công nợ còn lại của bạn.",
  },
};

const isBalancePolicy = (value: string): value is BalancePolicy =>
  (BALANCE_POLICIES as readonly string[]).includes(value);

/**
 * The balance policies a DEPOSIT order may use: the BE's `allowedBalancePolicies` this FE knows, in
 * the BE's order. Fewer than two is nothing to choose, so it is not offered (the BE applies the
 * customer's own policy). A policy newer than this FE is dropped, as with terms.
 */
export function resolveBalancePolicies(dto: PaymentTermsDto): BalancePolicyChoice | undefined {
  const known = (dto.allowedBalancePolicies ?? []).filter(isBalancePolicy);
  const allowed = BALANCE_POLICIES.filter((policy) => known.includes(policy));
  if (allowed.length < 2) return undefined;
  const own = dto.depositBalancePolicy;
  return {
    options: allowed.map((policy) => BALANCE_OPTIONS[policy]),
    defaultPolicy: own && isBalancePolicy(own) && allowed.includes(own) ? own : undefined,
  };
}

/** What the deposit order's balance is, as far as the checkout can tell beforehand. */
export const balanceAmount = (total: number, depositPercent: number) =>
  total - depositAmount(total, depositPercent);

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
    credit: creditSummary(dto),
    balance: allowed.includes("DEPOSIT") ? resolveBalancePolicies(dto) : undefined,
  };
}

/** The deposit the BE will ask for: the share of the total, rounded to whole VND as the BE does. */
export const depositAmount = (total: number, depositPercent: number) =>
  Math.round((total * depositPercent) / 100);
