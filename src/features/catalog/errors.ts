import { describeApiError, hasErrorCode, isForbiddenError } from "@/lib/api/describe-error";

const MESSAGE_BY_CODE: Record<string, string> = {
  UNAUTHORIZED: "Vui lòng đăng nhập để xem sản phẩm, giá và tồn kho.",
  FORBIDDEN: "Chỉ tài khoản khách hàng đã kích hoạt mới xem được giá và tồn kho.",
  NOT_FOUND: "Sản phẩm không còn khả dụng.",
  PRICE_NOT_AVAILABLE: "Sản phẩm tạm thời chưa có giá.",
};

/** Customer-facing text for any failure reaching the catalog UI. */
export const describeCatalogError = (error: unknown) => describeApiError(error, MESSAGE_BY_CODE);

/** Product missing, unpublished, or unknown slug (BE answers 404 NOT_FOUND for all three). */
export const isProductNotFound = (error: unknown) => hasErrorCode(error, "NOT_FOUND");

/** Not a signed-in customer: availability and prices are CUSTOMER-only, so staff get 403 there. */
export const isForbidden = isForbiddenError;

/**
 * The BE detail refuses the whole product (409) when one of its variants has no base price
 * (CatalogCommerceService.detail), so a product can be listed and still have no readable page.
 */
export const isPriceUnavailable = (error: unknown) => hasErrorCode(error, "PRICE_NOT_AVAILABLE");
