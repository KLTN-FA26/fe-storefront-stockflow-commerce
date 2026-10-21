import { PERM } from "@/lib/auth/permission-codes";
import { allowedTransitions, canTransition, isTerminal } from "@/lib/domain";

import type { DesignStatus } from "./types";

export const DESIGN_TRANSITIONS: Record<DesignStatus, readonly DesignStatus[]> = {
  Draft: ["Draft", "Ready", "Cancelled"],
  Ready: ["Confirmed", "Draft", "Cancelled"],
  Confirmed: ["Locked", "Superseded", "Cancelled"],
  Locked: ["Cancelled"],
  Superseded: [],
  Cancelled: [],
};

// The BE permission an action needs (BE DesignWorkflowController): never a role name.
const actionPermission: Record<string, string> = {
  save: PERM.designsUpdate,
  submit: PERM.designsUpdate,
  confirm: PERM.designsUpdate,
  edit: PERM.designsUpdate,
  cancel: PERM.designsUpdate,
  lock: PERM.designsApprove,
  review: PERM.designsApprove,
  supersede: PERM.designsApprove,
};

const statusActions: Record<DesignStatus, readonly string[]> = {
  Draft: ["save", "submit", "edit", "cancel"],
  Ready: ["confirm", "edit", "cancel"],
  Confirmed: ["lock", "supersede", "cancel"],
  Locked: ["cancel"],
  Superseded: [],
  Cancelled: [],
};

export function canMoveDesign(from: DesignStatus, to: DesignStatus): boolean {
  return canTransition(DESIGN_TRANSITIONS, from, to);
}

export function isDesignTerminal(status: DesignStatus): boolean {
  return isTerminal(DESIGN_TRANSITIONS, status);
}

export function nextDesignStatuses(status: DesignStatus): readonly DesignStatus[] {
  return allowedTransitions(DESIGN_TRANSITIONS, status);
}

/**
 * What may be done to a design now: the status offers actions, the account's permission codes
 * (GET /identity/me/permissions) narrow them. Until the permissions are known (undefined) the
 * status alone decides, as useHasPermission does; the BE re-checks every call.
 */
export function allowedActions(
  status: DesignStatus,
  permissions: readonly string[] | undefined,
): readonly string[] {
  return statusActions[status].filter((action) => {
    const needed = actionPermission[action];
    return !permissions || !needed || permissions.includes(needed);
  });
}
