import type { VectorPage } from "./vector-page";

/** The numbered resource names a recorded page uses (`createPdfCanvas`). */
const NUMBERED = /\/(VIm|VGs|VL|VMk|VWg)(\d+)\b/g;

type Offsets = Record<"VIm" | "VGs" | "VL" | "VMk" | "VWg", number>;

const renumber = (content: string, offsets: Offsets) =>
  content.replace(NUMBERED, (_match, name: keyof Offsets, index: string) => {
    return `/${name}${offsets[name] + Number(index)}`;
  });

/**
 * One page from several recorded pages drawn on it in order (a bag's four sides on its flat
 * sheet): their contents one after the other, each with its images, alphas, layers and white-ink
 * masks renumbered after the pages before it. Every part must already be in the page's own
 * coordinates (recorded with the sheet's base transform).
 */
export function mergeVectorPages(parts: readonly VectorPage[]): VectorPage {
  const offsets: Offsets = { VIm: 0, VGs: 0, VL: 0, VMk: 0, VWg: 0 };
  const merged: VectorPage = { content: "", images: [], alphas: [], layers: [] };
  const contents: string[] = [];
  const underlay: NonNullable<VectorPage["underlay"]> = { content: "", alphas: [], masks: [] };
  const underlayContents: string[] = [];
  for (const part of parts) {
    contents.push(renumber(part.content, offsets));
    merged.images.push(...part.images);
    merged.alphas.push(...part.alphas);
    merged.layers.push(...part.layers);
    if (part.underlay) {
      underlayContents.push(renumber(part.underlay.content, offsets));
      underlay.alphas.push(...part.underlay.alphas);
      underlay.masks.push(...part.underlay.masks);
    }
    offsets.VIm += part.images.length;
    offsets.VGs += part.alphas.length;
    offsets.VL += part.layers.length;
    offsets.VMk += part.underlay?.masks.length ?? 0;
    offsets.VWg += part.underlay?.alphas.length ?? 0;
  }
  merged.content = contents.join("\n");
  if (underlayContents.length > 0) {
    merged.underlay = { ...underlay, content: underlayContents.join("\n") };
  }
  return merged;
}
