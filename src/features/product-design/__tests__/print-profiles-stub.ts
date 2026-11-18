import { ISO_COATED_V2, type PrintProfiles } from "../engine";

/**
 * Stand-in colour profiles for suites that build the print file: jsdom serves no `public/` files.
 * Use with an async `vi.mock` factory that imports this module (the factory is hoisted).
 */
const PROFILES: PrintProfiles = {
  output: { ...ISO_COATED_V2, icc: new Uint8Array([1, 2, 3, 4]) },
  rgb: new Uint8Array([5, 6, 7]),
};

export const printProfilesStub = { loadPrintProfiles: async () => PROFILES };
