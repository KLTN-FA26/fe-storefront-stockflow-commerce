import { confirmDesignInputSchema, designDtoSchema, designUpdateInputSchema } from "./schemas";

import type { ConfirmDesignInput, DesignDto, DesignUpdateInput } from "./types";

const designs = new Map<string, DesignDto>([
  ["design-001", {
    id: "design-001",
    name: "Áo team launch",
    productName: "Áo thun cotton premium",
    variantName: "Đen · Size M",
    status: "Draft",
    preflightResult: "Warning",
    version: 2,
    updatedAt: "2026-09-14T09:30:00+07:00",
    elements: [
      { id: "el-1", type: "text", label: "StockFlow", x: 22, y: 28, width: 48, height: 12, outsidePrintArea: false },
      { id: "el-2", type: "image", label: "Logo", x: 38, y: 46, width: 22, height: 18, outsidePrintArea: false },
    ],
    preflightIssues: [
      { id: "pf-1", level: "warning", message: "Ảnh logo gần ngưỡng DPI tối thiểu." },
      { id: "pf-2", level: "pass", message: "Tất cả phần tử nằm trong vùng in." },
    ],
  }],
]);

export async function listDesigns(): Promise<DesignDto[]> {
  return Array.from(designs.values()).map((design) => designDtoSchema.parse(design));
}

export async function getDesign(id: string): Promise<DesignDto> {
  const design = designs.get(id);
  if (!design) throw new Error("Không tìm thấy thiết kế");
  return designDtoSchema.parse(design);
}

export async function updateDesignElements(input: DesignUpdateInput): Promise<DesignDto> {
  const parsed = designUpdateInputSchema.parse(input);
  const current = await getDesign(parsed.id);
  const next = designDtoSchema.parse({ ...current, ...parsed, status: "Draft", version: current.version + 1, updatedAt: new Date().toISOString() });
  designs.set(next.id, next);
  return next;
}

export async function submitDesign(id: string): Promise<DesignDto> {
  const current = await getDesign(id);
  if (current.preflightResult === "Fail") throw new Error("Không thể submit khi preflight fail");
  const next = designDtoSchema.parse({ ...current, status: "Ready", updatedAt: new Date().toISOString() });
  designs.set(id, next);
  return next;
}

export async function confirmDesign(input: ConfirmDesignInput): Promise<DesignDto> {
  const parsed = confirmDesignInputSchema.parse(input);
  const current = await getDesign(parsed.id);
  const next = designDtoSchema.parse({ ...current, status: "Confirmed", updatedAt: new Date().toISOString() });
  designs.set(parsed.id, next);
  return next;
}
