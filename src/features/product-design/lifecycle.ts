import { allowedTransitions, canTransition, isTerminal } from "@/lib/domain";

import type { DesignRole, DesignStatus } from "./types";

export const DESIGN_TRANSITIONS: Record<DesignStatus, readonly DesignStatus[]> = {
  Draft: ["Draft", "Ready", "Cancelled"],
  Ready: ["Confirmed", "Draft", "Cancelled"],
  Confirmed: ["Locked", "Superseded", "Cancelled"],
  Locked: ["Cancelled"],
  Superseded: [],
  Cancelled: [],
};

const roleActions: Record<DesignRole, readonly string[]> = {
  Customer: ["save", "submit", "confirm", "edit", "cancel"],
  "Sales Staff": ["save", "submit", "edit"],
  "E-commerce Admin": ["lock", "review"],
  System: ["lock", "supersede", "cancel"],
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

export function allowedActions(status: DesignStatus, role: DesignRole): readonly string[] {
  const byStatus = statusActions[status];
  const byRole = roleActions[role];
  return byStatus.filter((action) => byRole.includes(action));
}
