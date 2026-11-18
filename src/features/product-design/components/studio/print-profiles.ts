import { ISO_COATED_V2, type PrintProfiles } from "../../engine";
import { EXPORT_MESSAGES, ExportError } from "./export-canvas";

/**
 * The ICC profiles the print file embeds, served from `public/print/icc` (see its README for their
 * source and licence). ASSUMPTION (decided with the user 2026-11-18): they ship with the storefront
 * for now; once the print configuration names a profile per printing condition, they come from the
 * back end instead and only this loader changes.
 */
const OUTPUT_PROFILE_URL = "/print/icc/ISOcoated_v2_eci.icc";
const RGB_PROFILE_URL = "/print/icc/sRGB2014.icc";

let loading: Promise<PrintProfiles> | null = null;

async function bytesOf(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

/** Loads both profiles once per page; a failed load is tried again on the next call. */
export function loadPrintProfiles(): Promise<PrintProfiles> {
  loading ??= Promise.all([bytesOf(OUTPUT_PROFILE_URL), bytesOf(RGB_PROFILE_URL)]).then(
    ([icc, rgb]) => ({ output: { ...ISO_COATED_V2, icc }, rgb }),
    () => {
      loading = null;
      throw new ExportError(EXPORT_MESSAGES.profile);
    },
  );
  return loading;
}
