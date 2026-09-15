export interface Supplier { supplierId: string; name: string }
export interface Category { categoryId: string; name: { vi: string; en: string } }

const missing = "—";

export function getSupplierName(_id: string): string {
  return missing;
}

export function getSupplier(_id: string): Supplier | undefined {
  return undefined;
}

export function getWarehouseName(_id: string): string {
  return missing;
}

export function getCategoryName(_id: string, _lang: "vi" | "en" = "vi"): string {
  return missing;
}

export function getCategoryNameVi(id: string): string {
  return getCategoryName(id, "vi");
}
