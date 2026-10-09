import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api/client";

import { getCustomerProfile, updateCustomerProfile } from "./api";
import { customerProfileFormSchema, customerProfileSchema } from "./schemas";

afterEach(() => vi.restoreAllMocks());

const profile = {
  customerId: "CUS-0010",
  userId: "USER-CUS-0010",
  fullName: "Nguyễn Hoài Nam",
  email: "nam.nguyen@example.vn",
  phone: "+84908111222",
  segmentId: null,
  status: "ACTIVE",
  version: 3,
  createdAt: "2026-01-10T02:00:00Z",
};

describe("customer profile API boundary", () => {
  it("parses a valid profile response", async () => {
    vi.spyOn(api, "get").mockResolvedValueOnce({ data: profile });

    await expect(getCustomerProfile()).resolves.toEqual(profile);
  });

  it("rejects an invalid profile DTO instead of fabricating fields", () => {
    expect(() => customerProfileSchema.parse({ ...profile, version: "3" })).toThrow();
  });

  it.each(["0912345678", "+84912345678", "024 3825 1234", "(024)-3825.1234"])(
    "accepts a backend-valid Vietnamese phone: %s",
    (phone) => {
      expect(customerProfileFormSchema.parse({ fullName: "Nguyễn Hoài Nam", phone }).phone).toBe(
        phone,
      );
    },
  );

  it("accepts an optional blank phone and rejects an invalid number", () => {
    expect(customerProfileFormSchema.parse({ fullName: "Nguyễn Hoài Nam", phone: "" }).phone).toBe(
      "",
    );
    expect(() =>
      customerProfileFormSchema.parse({ fullName: "Nguyễn Hoài Nam", phone: "12345" }),
    ).toThrow();
  });

  it("sends only editable fields and the current version", async () => {
    const put = vi.spyOn(api, "put").mockResolvedValueOnce({
      data: { ...profile, fullName: "Tên mới", phone: null, version: 4 },
    });

    await updateCustomerProfile({ fullName: "Tên mới", phone: null, version: 3 });

    expect(put).toHaveBeenCalledWith("/customers/me", {
      fullName: "Tên mới",
      phone: null,
      version: 3,
    });
    expect(put.mock.calls[0]?.[1]).not.toHaveProperty("email");
    expect(put.mock.calls[0]?.[1]).not.toHaveProperty("customerId");
    expect(put.mock.calls[0]?.[1]).not.toHaveProperty("userId");
    expect(put.mock.calls[0]?.[1]).not.toHaveProperty("status");
  });
});
