import { z } from "zod";
import { ApiError } from "./error";

/**
 * BE envelope ApiResponse<T> — every endpoint returns it (docs/common/api/ApiResponse.java).
 * success/data/errorCode/message/fieldErrors/correlationId/timestamp
 */
export const fieldErrorSchema = z.object({
  field: z.string(),
  message: z.string(),
  code: z.string().nullable().optional(),
});

export function envelopeSchema<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.object({
    success: z.boolean(),
    data: dataSchema.nullable().optional(),
    errorCode: z.string().nullable().optional(),
    message: z.string().nullable().optional(),
    fieldErrors: z.array(fieldErrorSchema).nullable().optional(),
    correlationId: z.string().nullable().optional(),
    timestamp: z.string().nullable().optional(),
  });
}

/** Unwrap ApiResponse envelope; throw ApiError on success=false. Parse data with dataSchema.
 *  Falls back to raw parsing when `success` is absent (mock adapter / legacy handler)
 *  so USE_MOCK=true does not break after contract change.
 */
export function unwrapEnvelope<T>(raw: unknown, dataSchema: z.ZodType<T>): T {
  const hasEnvelope =
    raw !== null &&
    typeof raw === "object" &&
    !Array.isArray(raw) &&
    "success" in (raw as Record<string, unknown>);

  if (!hasEnvelope) {
    return dataSchema.parse(raw);
  }

  const base = z
    .object({
      success: z.boolean(),
      data: z.unknown().nullable().optional(),
      errorCode: z.string().nullable().optional(),
      message: z.string().nullable().optional(),
      fieldErrors: z.array(fieldErrorSchema).nullable().optional(),
      correlationId: z.string().nullable().optional(),
    })
    .parse(raw);

  if (!base.success) {
    const fieldErrors: Record<string, string> | undefined = base.fieldErrors?.length
      ? Object.fromEntries(base.fieldErrors.map((e) => [e.field, e.message]))
      : undefined;
    // httpStatus is not in envelope; derive from errorCode when possible, otherwise 400
    const status = 400;
    throw new ApiError(
      status,
      base.errorCode ?? "UNKNOWN",
      base.message ?? "Đã xảy ra lỗi",
      fieldErrors,
      base.correlationId ?? undefined,
    );
  }

  // data may be null for void responses
  if (base.data == null) {
    // For void callers, they will pass z.void() / z.null() — let zod decide.
    return dataSchema.parse(base.data) as T;
  }
  return dataSchema.parse(base.data);
}
