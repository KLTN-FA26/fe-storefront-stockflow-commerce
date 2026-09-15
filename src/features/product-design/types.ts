import type { z } from "zod";

import type { confirmDesignInputSchema, designDtoSchema, designElementSchema, designRoleSchema, designStatusSchema, designUpdateInputSchema, preflightIssueSchema, preflightResultSchema } from "./schemas";

export type DesignStatus = z.infer<typeof designStatusSchema>;
export type PreflightResult = z.infer<typeof preflightResultSchema>;
export type DesignRole = z.infer<typeof designRoleSchema>;
export type DesignElement = z.infer<typeof designElementSchema>;
export type PreflightIssue = z.infer<typeof preflightIssueSchema>;
export type DesignDto = z.infer<typeof designDtoSchema>;
export type DesignUpdateInput = z.infer<typeof designUpdateInputSchema>;
export type ConfirmDesignInput = z.infer<typeof confirmDesignInputSchema>;
