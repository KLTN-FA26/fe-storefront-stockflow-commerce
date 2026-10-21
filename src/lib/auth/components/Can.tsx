/**
 * <Can> — declarative permission gate.
 *
 * Renders children only when the account holds the BE permission code (from
 * GET /identity/me/permissions). Never keyed on a role name. UI-only: the BE re-checks.
 *
 * @example
 *   <Can permission="sales-orders:UPDATE" fallback={<p>Liên hệ CSKH để huỷ đơn.</p>}>
 *     <Button onClick={cancel}>Huỷ đơn</Button>
 *   </Can>
 */

"use client";

import type React from "react";

import { useHasPermission } from "../my-permissions";

interface CanProps {
  /** BE permission code, "resource:ACTION" (see permission-codes.ts). */
  permission: string;
  /** Fallback UI when the permission is missing. Defaults to null (render nothing). */
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

export function Can({ permission, fallback = null, children }: CanProps) {
  return useHasPermission(permission) ? <>{children}</> : <>{fallback}</>;
}

/** Hook version — for the boolean in logic. Offered until the list is known (see useHasPermission). */
export function useCan(permission: string): boolean {
  return useHasPermission(permission);
}
