import { describe, expect, it } from "vitest";

import { PERM } from "@/lib/auth/permission-codes";

import { allowedActions } from "./lifecycle";

describe("allowedActions: the status offers actions, permission codes narrow them", () => {
  it("offers what the status allows to an account holding design-designs:UPDATE", () => {
    expect(allowedActions("Ready", [PERM.designsUpdate])).toEqual(["confirm", "edit", "cancel"]);
  });

  it("takes an action away when its permission is missing, whatever role the account has", () => {
    expect(allowedActions("Ready", ["sales-orders:READ"])).toEqual([]);
    expect(allowedActions("Confirmed", [PERM.designsUpdate])).toEqual(["cancel"]);
    expect(allowedActions("Confirmed", [PERM.designsApprove])).toEqual(["lock", "supersede"]);
  });

  it("lets the status decide until the permissions are known; the BE re-checks", () => {
    expect(allowedActions("Draft", undefined)).toEqual(["save", "submit", "edit", "cancel"]);
  });

  it("offers nothing in a terminal status", () => {
    expect(allowedActions("Cancelled", [PERM.designsUpdate, PERM.designsApprove])).toEqual([]);
  });
});
