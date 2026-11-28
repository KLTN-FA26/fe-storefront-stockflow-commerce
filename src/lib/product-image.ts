/**
 * Seeded catalogue images on the demo BE are `placehold.co` URLs that draw the SKU on a grey box
 * ("HOP-BANH-M", "LY-GIAY-12OZ"): no stored file, and to a customer they read as an unfinished site
 * (UI/UX 27/11, sf-01). The storefront treats them, and the other placeholder services, as "no
 * image" and draws an illustration of the product's kind instead.
 */
const PLACEHOLDER_HOSTS = ["placehold.co", "placehold.it", "via.placeholder.com", "dummyimage.com"];

export function isPlaceholderImage(src: string | null | undefined): boolean {
  if (!src) return false;
  try {
    const host = new URL(src).hostname.toLowerCase();
    return PLACEHOLDER_HOSTS.some((known) => host === known || host.endsWith(`.${known}`));
  } catch {
    // A relative path (a local asset) is a real image.
    return false;
  }
}

/** A real image to show, or undefined when there is none (absent, or a placeholder service). */
export const realImage = (src: string | null | undefined): string | undefined =>
  src && !isPlaceholderImage(src) ? src : undefined;

/** The kinds of product the shop prints on, as far as an illustration goes. */
export type ProductShape = "cup" | "bowl" | "box" | "bag" | "generic";

/** Words of a product's name, lower-cased, without Vietnamese tone marks ("Hộp" → "hop"). */
function words(name: string): string[] {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

const SHAPE_WORDS: readonly [ProductShape, readonly string[]][] = [
  ["box", ["hop", "box", "thung", "carton"]],
  ["bag", ["tui", "bag"]],
  ["bowl", ["to", "bat", "chen", "bowl"]],
  ["cup", ["ly", "coc", "cup", "lid", "nap"]],
];

/**
 * The kind a product's name says it is, by its first word that names one ("Ly giấy 12oz" → cup,
 * "Hộp giấy đựng bánh" → box, "Túi kraft" → bag, "Tô giấy" → bowl); "generic" otherwise.
 */
export function productShapeOf(name: string): ProductShape {
  for (const word of words(name)) {
    for (const [shape, names] of SHAPE_WORDS) if (names.includes(word)) return shape;
  }
  return "generic";
}
