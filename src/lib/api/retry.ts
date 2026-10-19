import { z } from "zod";

import { ApiError } from "./error";

/**
 * React Query retry policy: only what can change on a second try — network blips and 5xx. A 4xx
 * (not signed in, not found, a bad parameter) and a contract break (ZodError) answer the same
 * again, so retrying them only delays the message.
 */
export const retryTransient = (failureCount: number, error: unknown) =>
  !(error instanceof ApiError && error.isClientError) &&
  !(error instanceof z.ZodError) &&
  failureCount < 2;
