import { useMemo, useState } from "react";

import { usePaymentTerms } from "@/lib/payment-terms";

import { resolvePaymentTerms } from "./checkout-payment-terms";
import {
  BALANCE_POLICIES,
  PAYMENT_TERMS,
  type BalancePolicy,
  type CheckoutPaymentTerm,
} from "./checkout-schemas";
import {
  readPickedBalance,
  readPickedTerm,
  rememberPickedBalance,
  rememberPickedTerm,
} from "./request-id";

/**
 * What the customer pays and how: the payment term and, for a DEPOSIT order, how its balance is
 * paid (kltn-docs 15 BR-01). Both picks survive a reload (they are part of the order's idempotency
 * key, see request-id.ts) and are only honoured while the BE still allows them. `sentTerm` and
 * `sentBalance` are what goes in the request: a value equal to the customer's own default is left
 * out, because the BE applies the default itself and the same order must stay the same request.
 */
export function useCheckoutPayment(enabled: boolean) {
  const termsQuery = usePaymentTerms(enabled);
  const [pickedTerm, setPickedTerm] = useState<CheckoutPaymentTerm | undefined>(() => {
    const stored = readPickedTerm();
    return PAYMENT_TERMS.find((term) => term === stored);
  });
  const [pickedBalance, setPickedBalance] = useState<BalancePolicy | undefined>(() => {
    const stored = readPickedBalance();
    return BALANCE_POLICIES.find((policy) => policy === stored);
  });
  const terms = useMemo(
    () => (termsQuery.data ? resolvePaymentTerms(termsQuery.data) : undefined),
    [termsQuery.data],
  );

  // The pick if it is still allowed, else the customer's default. Terms read earlier still count
  // when a refetch fails (stale data is kept), so what is shown and what is sent stay the same.
  const paymentTerm =
    (pickedTerm && terms?.options.some((o) => o.term === pickedTerm) ? pickedTerm : undefined) ??
    terms?.defaultTerm;
  const sentTerm = paymentTerm && paymentTerm !== terms?.defaultTerm ? paymentTerm : undefined;

  // The balance policy only exists for a DEPOSIT order with a real choice.
  const balanceChoice = paymentTerm === "DEPOSIT" ? terms?.balance : undefined;
  const balancePolicy: BalancePolicy | undefined = balanceChoice
    ? ((pickedBalance && balanceChoice.options.some((o) => o.policy === pickedBalance)
        ? pickedBalance
        : undefined) ??
      balanceChoice.defaultPolicy ??
      balanceChoice.options[0]?.policy)
    : undefined;
  // Sent unless it is the customer's own policy (which the BE applies by itself).
  const sentBalance =
    balancePolicy && balancePolicy !== balanceChoice?.defaultPolicy ? balancePolicy : undefined;

  // No terms to check an earlier pick against: ordering waits for them, rather than placing an
  // order that may differ from the one the earlier pick sent.
  const awaitingTerms =
    !terms && !termsQuery.isPending && (pickedTerm !== undefined || pickedBalance !== undefined);

  return {
    termsQuery,
    terms,
    paymentTerm,
    sentTerm,
    balanceChoice,
    balancePolicy,
    sentBalance,
    awaitingTerms,
    pickTerm: (term: CheckoutPaymentTerm) => {
      setPickedTerm(term);
      rememberPickedTerm(term);
    },
    pickBalance: (policy: BalancePolicy) => {
      setPickedBalance(policy);
      rememberPickedBalance(policy);
    },
  };
}
