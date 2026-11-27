import { ToneBadge } from "@/components/storefront/tone-badge";

import { CREDIT_REQUEST_STATUS_META } from "../lifecycle";

import type { CreditRequestStatus } from "../schemas";

export function CreditRequestStatusBadge({ status }: { status: CreditRequestStatus }) {
  const meta = CREDIT_REQUEST_STATUS_META[status];
  return <ToneBadge label={meta.label} tone={meta.tone} size="sm" />;
}
