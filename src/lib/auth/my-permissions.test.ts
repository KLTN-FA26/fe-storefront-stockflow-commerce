import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { api } from "@/lib/api/client";

import { getMyPermissions } from "./my-permissions";

afterEach(() => vi.restoreAllMocks());

describe("GET /identity/me/permissions (BE MeController)", () => {
  it("parses MyPermissionsResponse", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValueOnce({
      data: { roles: ["CUSTOMER"], permissions: ["sales-orders:READ"], dataScope: "OWN" },
    });

    await expect(getMyPermissions()).resolves.toEqual({
      roles: ["CUSTOMER"],
      permissions: ["sales-orders:READ"],
      dataScope: "OWN",
    });
    expect(get).toHaveBeenCalledWith("/identity/me/permissions", {});
  });

  it("rejects an unknown data scope as a contract break", async () => {
    vi.spyOn(api, "get").mockResolvedValueOnce({
      data: { roles: [], permissions: [], dataScope: "EVERYTHING" },
    });
    await expect(getMyPermissions()).rejects.toBeInstanceOf(z.ZodError);
  });
});
