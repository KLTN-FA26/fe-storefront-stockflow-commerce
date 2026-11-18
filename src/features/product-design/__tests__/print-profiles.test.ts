import { afterEach, describe, expect, it, vi } from "vitest";

import { ISO_COATED_V2 } from "../engine";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

/** A fresh loader (its cache is per module) over a `fetch` that answers with `respond`. */
async function loaderWith(respond: (url: string) => Response) {
  const fetch = vi.fn(async (url: string) => respond(url));
  vi.stubGlobal("fetch", fetch);
  const { loadPrintProfiles } = await import("../components/studio/print-profiles");
  // The same module instance as the loader's: a reset registry gives each test its own.
  const { ExportError } = await import("../components/studio/export-canvas");
  return { fetch, loadPrintProfiles, ExportError };
}

describe("loadPrintProfiles", () => {
  it("loads the CMYK and sRGB profiles from public/print/icc, once", async () => {
    const { fetch, loadPrintProfiles } = await loaderWith(
      (url) => new Response(url.endsWith("sRGB2014.icc") ? "rgb" : "cmyk"),
    );
    const profiles = await loadPrintProfiles();
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      "/print/icc/ISOcoated_v2_eci.icc",
      "/print/icc/sRGB2014.icc",
    ]);
    expect(profiles.output).toMatchObject(ISO_COATED_V2);
    expect(new TextDecoder().decode(profiles.output.icc)).toBe("cmyk");
    expect(new TextDecoder().decode(profiles.rgb)).toBe("rgb");

    await loadPrintProfiles();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("tells the customer when a profile cannot be loaded, and tries again next time", async () => {
    let status = 404;
    const { fetch, loadPrintProfiles, ExportError } = await loaderWith(
      () => new Response("x", { status }),
    );
    await expect(loadPrintProfiles()).rejects.toThrow(ExportError);
    await expect(loadPrintProfiles()).rejects.toThrow(/hồ sơ màu/);

    status = 200;
    await expect(loadPrintProfiles()).resolves.toBeDefined();
    expect(fetch).toHaveBeenCalledTimes(6);
  });
});
