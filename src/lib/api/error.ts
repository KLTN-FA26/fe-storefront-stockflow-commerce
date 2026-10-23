/** Normalised backend ApiResponse failure for feature consumers. */

import { type AxiosError } from "axios";

export interface ApiFieldError {
  field: string;
  message: string;
  code?: string;
}

export interface ApiErrorBody {
  success?: boolean;
  errorCode?: string;
  message?: string;
  fieldErrors?: ApiFieldError[] | Record<string, string>;
  correlationId?: string;
  timestamp?: string;
  /** Machine-readable facts about the failure (e.g. the credit left); absent on most errors. */
  details?: Record<string, unknown>;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fieldErrors: Record<string, string> | undefined;
  readonly fieldErrorDetails: readonly ApiFieldError[];
  readonly correlationId: string | undefined;
  /** BE `details`: structured numbers/dates behind the code, so screens never parse `message`. */
  readonly details: Readonly<Record<string, unknown>> | undefined;

  constructor(
    status: number,
    code: string,
    message: string,
    fieldErrors?: ApiFieldError[] | Record<string, string>,
    correlationId?: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.fieldErrorDetails = normalizeFieldErrorDetails(fieldErrors);
    this.fieldErrors = toFieldErrorMap(this.fieldErrorDetails);
    this.correlationId = correlationId;
    this.details = details;
  }

  /** Create from an AxiosError (used in response interceptor). */
  static from(err: AxiosError<ApiErrorBody>): ApiError {
    const data = err.response?.data;
    const status = err.response?.status ?? 0;

    if (!err.response) {
      return new ApiError(
        0,
        "NETWORK_ERROR",
        "Không kết nối được máy chủ. Vui lòng kiểm tra mạng.",
      );
    }

    return new ApiError(
      status,
      data?.errorCode ?? `HTTP_${status}`,
      data?.message ?? err.message ?? "Đã xảy ra lỗi",
      data?.fieldErrors,
      data?.correlationId,
      isRecord(data?.details) ? data.details : undefined,
    );
  }

  get isClientError(): boolean {
    return this.status >= 400 && this.status < 500;
  }
}

function normalizeFieldErrorDetails(errors: ApiErrorBody["fieldErrors"]): ApiFieldError[] {
  if (!errors) return [];
  if (Array.isArray(errors)) return errors;
  return Object.entries(errors).map(([field, message]) => ({ field, message }));
}

function toFieldErrorMap(errors: readonly ApiFieldError[]): Record<string, string> | undefined {
  if (errors.length === 0) return undefined;
  const result: Record<string, string> = {};
  for (const error of errors) {
    if (!(error.field in result)) result[error.field] = error.message;
  }
  return result;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
