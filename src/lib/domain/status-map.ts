/**
 * Domain: status-map re-export.
 *
 * The canonical file lives at `@/lib/status-map` for backwards compatibility.
 * New code should import from `@/lib/domain/status-map`.
 */

export { toneOf, STATUS_LABEL_VI, type SemanticTone } from "@/lib/status-map";
export type { StatusDomain, Currency } from "./types";
