import { describeBeRefusal, hasErrorCode } from "@/lib/api/describe-error";
import { ApiError } from "@/lib/api/error";

// What a refused quote request says and where (plan WF-02 §1.2, §4): the BE words its refusals of a
// quote request in Vietnamese (PR #365), so a 4xx shows its `message`; field errors go under their
// field; 401/403/429, 5xx and a broken network keep the common Vietnamese text.

/**
 * Words for the codes whose BE text names an enum or would read wrong here. `DESIGN_NOT_APPROVED`
 * and `CUSTOMER_NOT_ACTIVE` keep the BE's message (it names the status); a 404 here is a design or
 * project the customer no longer has.
 */
const QUOTE_MESSAGE_BY_CODE: Record<string, string> = {
  NOT_FOUND: "Không tìm thấy thiết kế hoặc dự án này. Hãy tải lại trang.",
};

export function describeQuoteRequestError(error: unknown): string {
  return describeBeRefusal(error, QUOTE_MESSAGE_BY_CODE);
}

/** 409 `CUSTOMER_NOT_ACTIVE`: the account cannot ask for a quote now; asking again cannot help. */
export const isCustomerInactive = (error: unknown) => hasErrorCode(error, "CUSTOMER_NOT_ACTIVE");

/** A failure a second try may get past: the network, or the server (5xx). */
export const isTransientFailure = (error: unknown) =>
  error instanceof ApiError && (error.status === 0 || error.status >= 500);

/** The fields of a quote request a refusal can name. */
export type QuoteFieldErrors = { cartons?: string; desiredDeliveryDate?: string };

/**
 * The field errors of a refused request, under the form's names: `cartons` and
 * `desiredDeliveryDate` for A-1, `quoteRequest.cartons` / `quoteRequest.desiredDeliveryDate` for a
 * submission (pass `prefix: "quoteRequest."`). Null when the refusal names none of them.
 */
export function quoteFieldErrorsOf(error: unknown, prefix = ""): QuoteFieldErrors | null {
  if (!(error instanceof ApiError)) return null;
  const found: QuoteFieldErrors = {};
  for (const { field, message } of error.fieldErrorDetails) {
    if (field === `${prefix}cartons`) found.cartons = message;
    if (field === `${prefix}desiredDeliveryDate`) found.desiredDeliveryDate = message;
  }
  return found.cartons || found.desiredDeliveryDate ? found : null;
}

/** The field errors of a refused project request (A-6), `lines[i]` being the i-th line SENT. */
export type ProjectQuoteFieldErrors = {
  desiredDeliveryDate?: string;
  /** By index in the request's `lines`. */
  cartons: ReadonlyMap<number, string>;
};

const LINE_CARTONS = /^lines\[(\d+)\]\.cartons$/;

export function projectQuoteFieldErrorsOf(error: unknown): ProjectQuoteFieldErrors | null {
  if (!(error instanceof ApiError)) return null;
  let desiredDeliveryDate: string | undefined;
  const cartons = new Map<number, string>();
  for (const { field, message } of error.fieldErrorDetails) {
    if (field === "desiredDeliveryDate") desiredDeliveryDate = message;
    const line = LINE_CARTONS.exec(field);
    if (line) cartons.set(Number(line[1]), message);
  }
  if (!desiredDeliveryDate && cartons.size === 0) return null;
  return { ...(desiredDeliveryDate ? { desiredDeliveryDate } : {}), cartons };
}
