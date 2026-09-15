/**
 * <Can> — declarative permission gate.
 *
 * Renders children only when the current user has the required permission.
 * Uses `effectiveRoles()` from auth-store (respects impersonation).
 *
 * @example
 *   <Can permission="po.create">
 *     <Button>Tạo đơn đặt hàng</Button>
 *   </Can>
 *
 *   <Can permission="po.approve" fallback={<Tooltip content="Không có quyền"><Button disabled>Duyệt</Button></Tooltip>}>
 *     <Button onClick={handleApprove}>Duyệt</Button>
 *   </Can>
 */

"use client";

import React from "react";
import { useAuthStore } from "../auth-store";
import { can, type Permission } from "../permissions";

interface CanProps {
  /** Permission string to check (e.g. "po.create"). */
  permission: Permission;
  /** Fallback UI when permission is denied. Defaults to null (render nothing). */
  fallback?: React.ReactNode;
  /** Children to render when permission is granted. */
  children: React.ReactNode;
}

export function Can({ permission, fallback = null, children }: CanProps) {
  const effectiveRoles = useAuthStore((s) => s.effectiveRoles);
  const roles = effectiveRoles();

  // Grant if any of the user's effective roles has the permission
  const allowed = roles.some((role) => can(role, permission));

  if (!allowed) return <>{fallback}</>;
  return <>{children}</>;
}

/**
 * Hook version — use when you need the boolean in logic, not just rendering.
 *
 * @example
 *   const canCreate = useCan("po.create");
 *   if (canCreate) { ... }
 */
export function useCan(permission: Permission): boolean {
  const effectiveRoles = useAuthStore((s) => s.effectiveRoles);
  const roles = effectiveRoles();
  return roles.some((role) => can(role, permission));
}
