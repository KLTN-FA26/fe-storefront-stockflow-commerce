import { z } from "zod";

export const ENUM_UNKNOWN = "UNKNOWN" as const;

/**
 * A BE enum that grows without the FE shipping: a value this FE does not know becomes "UNKNOWN"
 * instead of failing the whole response as a contract error. Still a contract error when the
 * field is missing or not a string.
 */
export function tolerantEnum<const T extends readonly string[]>(values: T) {
  return z
    .string()
    .transform((value): T[number] | typeof ENUM_UNKNOWN =>
      (values as readonly string[]).includes(value) ? (value as T[number]) : ENUM_UNKNOWN,
    );
}
