import type { AxiosRequestConfig } from "axios";

/**
 * Spring binds `@RequestParam List<String> sku` from `?sku=A&sku=B`, but axios writes an array as
 * `sku[]=A&sku[]=B` by default, which the BE sees as no `sku` at all (400 VALIDATION_FAILED).
 * Spread this into a request config whose params carry arrays.
 */
export const REPEATED_PARAMS: Pick<AxiosRequestConfig, "paramsSerializer"> = {
  paramsSerializer: { indexes: null },
};
