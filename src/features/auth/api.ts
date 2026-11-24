import { api } from "@/lib/api/client";

import { activationRequestSchema, activationResponseSchema, type ActivationRequest } from "./schemas";

/**
 * Redeem a portal invitation: anonymous (the contact has no password yet), 10 a minute per IP. Answers the e-mail the
 * account signs in with; signing in is the login endpoint's job.
 */
export async function activatePortalAccount(request: ActivationRequest): Promise<string> {
  const { data } = await api.post<unknown>(
    "/customers/portal-activation",
    activationRequestSchema.parse(request),
  );
  return activationResponseSchema.parse(data).email;
}
