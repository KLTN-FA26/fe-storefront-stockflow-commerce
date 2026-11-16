/**
 * A font code as a customer reads it: "be-vietnam-pro" -> "Be Vietnam Pro". The storefront pages
 * do not load the studio's font registry (and its labels), so this is the readable stand-in there.
 */
export const fontLabelOf = (code: string): string =>
  code
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
