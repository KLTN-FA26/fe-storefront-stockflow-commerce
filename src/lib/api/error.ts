import { type AxiosError } from "axios";

export interface ApiErrorBody {
  code?: string;
  errorCode?: string;
  message?: string;
  fieldErrors?:
    Record<string, string> | Array<{ field: string; message: string; code?: string | null }>;
  traceId?: string;
  correlationId?: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fieldErrors: Record<string, string> | undefined;
  readonly traceId: string | undefined;

  constructor(
    status: number,
    code: string,
    message: string,
    fieldErrors?: Record<string, string>,
    traceId?: string,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.fieldErrors = fieldErrors;
    this.traceId = traceId;
  }

  static from(err: AxiosError<ApiErrorBody>): ApiError {
    const data = err.response?.data as (ApiErrorBody & { fieldErrors?: unknown }) | undefined;
    const status = err.response?.status ?? 0;

    if (!err.response) {
      return new ApiError(
        0,
        "NETWORK_ERROR",
        "Không kết nối được máy chủ. Vui lòng kiểm tra mạng.",
      );
    }

    // BE sends { errorCode, fieldErrors: [{field,message}] } — normalize to Record
    let fieldErrors: Record<string, string> | undefined;
    const raw = data?.fieldErrors;
    if (Array.isArray(raw)) {
      const rec: Record<string, string> = {};
      for (const e of raw as Array<{ field: string; message: string }>) {
        if (e?.field) rec[e.field] = e.message;
      }
      if (Object.keys(rec).length) fieldErrors = rec;
    } else if (raw && typeof raw === "object") {
      fieldErrors = raw as Record<string, string>;
    }

    const code = data?.errorCode ?? data?.code ?? `HTTP_${status}`;
    return new ApiError(
      status,
      code,
      data?.message ?? err.message ?? "Đã xảy ra lỗi",
      fieldErrors,
      data?.correlationId ?? data?.traceId,
    );
  }

  get isClientError(): boolean {
    return this.status >= 400 && this.status < 500;
  }
}
