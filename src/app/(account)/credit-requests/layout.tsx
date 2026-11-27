/**
 * `/credit-requests/*` sits outside `/account` only because the BE notification links `/credit-requests/{id}` (handoff
 * A4); it shows inside the same account rail.
 */
export { default } from "../account/layout";
