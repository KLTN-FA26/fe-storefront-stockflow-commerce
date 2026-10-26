"use client";

import { useQuery } from "@tanstack/react-query";

import { QUERY_TIMES } from "@/lib/api/query-client";

interface ProvinceApiItem {
  code: number;
  name: string;
}

interface ProvinceDetail extends ProvinceApiItem {
  wards?: ProvinceApiItem[];
}

export interface AddressOption {
  value: string;
  label: string;
}

// Configured in .env.example; next.config.ts inlines it into the client bundle.
const API_BASE = process.env.VIETNAM_PROVINCES_API_URL;

function toOptions(items: ProvinceApiItem[] | undefined): AddressOption[] {
  return (items ?? []).map((item) => ({ value: String(item.code), label: item.name }));
}

async function fetchJson<T>(path: string): Promise<T> {
  if (!API_BASE) throw new Error("Thiếu cấu hình VIETNAM_PROVINCES_API_URL");
  const response = await fetch(`${API_BASE}${path}`);
  if (!response.ok) throw new Error(`Không tải được danh mục địa chỉ (HTTP ${response.status})`);
  return (await response.json()) as T;
}

async function getProvinces() {
  return toOptions(await fetchJson<ProvinceApiItem[]>(""));
}

async function getWards(provinceCode: string) {
  const data = await fetchJson<ProvinceDetail>(`/p/${encodeURIComponent(provinceCode)}?depth=2`);
  return toOptions(data.wards);
}

export function useVietnamAddresses(provinceCode: string) {
  // Administrative units are master data: cache long and do not refetch on window focus.
  const provinces = useQuery({ queryKey: ["vn-provinces"], queryFn: getProvinces, ...QUERY_TIMES.master });
  const wards = useQuery({
    queryKey: ["vn-wards", provinceCode],
    queryFn: () => getWards(provinceCode),
    enabled: Boolean(provinceCode),
    ...QUERY_TIMES.master,
  });

  return {
    provinces: provinces.data ?? [],
    wards: provinceCode ? wards.data ?? [] : [],
    loading: provinces.isLoading || wards.isLoading,
    /** Set when the province/ward list cannot be loaded (network, HTTP error, missing config). */
    error: provinces.error ?? (provinceCode ? wards.error : null),
    retry: () => {
      if (provinces.error) void provinces.refetch();
      if (provinceCode && wards.error) void wards.refetch();
    },
  };
}
