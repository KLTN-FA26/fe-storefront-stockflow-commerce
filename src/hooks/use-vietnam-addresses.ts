"use client";

import { useQuery } from "@tanstack/react-query";

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

const API_BASE = process.env.NEXT_PUBLIC_VIETNAM_PROVINCES_API_URL || "https://provinces.open-api.vn/api/v2";

function toOptions(items: ProvinceApiItem[] | undefined): AddressOption[] {
  return (items ?? []).map((item) => ({ value: String(item.code), label: item.name }));
}

async function getProvinces() {
  const response = await fetch(API_BASE);
  const data = await response.json() as ProvinceApiItem[];
  return toOptions(data);
}

async function getWards(provinceCode: string) {
  const response = await fetch(`${API_BASE}/p/${provinceCode}?depth=2`);
  const data = await response.json() as ProvinceDetail;
  return toOptions(data.wards);
}

export function useVietnamAddresses(provinceCode: string) {
  const provinces = useQuery({ queryKey: ["vn-provinces"], queryFn: getProvinces });
  const wards = useQuery({ queryKey: ["vn-wards", provinceCode], queryFn: () => getWards(provinceCode), enabled: Boolean(provinceCode) });

  return {
    provinces: provinces.data ?? [],
    wards: provinceCode ? wards.data ?? [] : [],
    loading: provinces.isLoading || wards.isLoading,
  };
}
