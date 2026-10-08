/**
 * The signed-in user's effective permissions — BE GET /identity/me/permissions (MeController).
 *
 * Storefront customers all share the CUSTOMER role, so this is not a role matrix like the
 * back office: it only lets a screen drop an action an admin has taken away from the role
 * (e.g. `sales-orders:UPDATE` for cancelling), instead of offering it and failing with 403.
 * UI-only — the BE re-checks every call.
 */

import { useQuery } from "@tanstack/react-query";
import { z } from "zod";

import { api } from "@/lib/api/client";
import { QUERY_TIMES } from "@/lib/api/query-client";

// MyPermissionsResponse: `permissions` are PermissionCode strings, "resource:ACTION", sorted.
export const myPermissionsDtoSchema = z.object({
  roles: z.array(z.string()),
  permissions: z.array(z.string()),
  dataScope: z.enum(["OWN", "TEAM", "WAREHOUSE", "ALL"]),
});

export type MyPermissions = z.infer<typeof myPermissionsDtoSchema>;

export const myPermissionKeys = {
  all: ["my-permissions"] as const,
};

export async function getMyPermissions(signal?: AbortSignal): Promise<MyPermissions> {
  const { data } = await api.get<unknown>("/identity/me/permissions", signal ? { signal } : {});
  return myPermissionsDtoSchema.parse(data);
}

export function useMyPermissions() {
  return useQuery({
    queryKey: myPermissionKeys.all,
    queryFn: ({ signal }) => getMyPermissions(signal),
    ...QUERY_TIMES.master,
  });
}

/**
 * `false` only when the permission list is known and lacks `code`. While loading, or when the
 * list could not be fetched, the action stays offered: hiding it on a transient error would
 * take away something the BE would have allowed, and a real refusal still comes back as 403.
 */
export function useHasPermission(code: string): boolean {
  const { data } = useMyPermissions();
  return data ? data.permissions.includes(code) : true;
}
