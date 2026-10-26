import { afterEach, describe, expect, it } from "vitest";

import { endSession } from "./session";
import { clearSignedInStorage, signedInStorageKey } from "./signed-in-storage";

const DRAFT = signedInStorageKey("design-draft:7d51f000-0000-4000-8000-000000000002");
const PREFERENCE = "stockflow-storefront-app";

afterEach(() => {
  window.localStorage.clear();
});

function keepBoth() {
  window.localStorage.setItem(DRAFT, "{}");
  window.localStorage.setItem(PREFERENCE, "{}");
}

describe("what a signed-in customer leaves in this browser", () => {
  it("goes when the customer signs out; the viewer's preferences stay", () => {
    keepBoth();
    endSession({ clearCart: true });

    expect(window.localStorage.getItem(DRAFT)).toBeNull();
    expect(window.localStorage.getItem(PREFERENCE)).toBe("{}");
  });

  it("stays when the session only expired: the same customer signs in again", () => {
    keepBoth();
    endSession();

    expect(window.localStorage.getItem(DRAFT)).toBe("{}");
  });

  it("clears every key under the prefix, and only those", () => {
    keepBoth();
    window.localStorage.setItem(signedInStorageKey("other"), "1");
    clearSignedInStorage();

    expect(window.localStorage.getItem(DRAFT)).toBeNull();
    expect(window.localStorage.getItem(signedInStorageKey("other"))).toBeNull();
    expect(window.localStorage.getItem(PREFERENCE)).toBe("{}");
  });
});
