import { z } from "zod";

import { api } from "@/lib/api/client";

import { withSignal } from "./api-request";

/** `GET /design-fonts` (BE-18): the fonts the BE accepts in a print configuration, `[{ code, label }]`. */
const designFontsDtoSchema = z.array(z.object({ code: z.string().min(1), label: z.string() }));

/** The codes the BE lists, in its order. */
export async function listDesignFontCodes(signal?: AbortSignal): Promise<string[]> {
  const { data } = await api.get<unknown>("/design-fonts", withSignal(signal));
  return designFontsDtoSchema.parse(data).map((font) => font.code);
}
