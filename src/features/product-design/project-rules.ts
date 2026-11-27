import { MIN_SET_SIZE, PROJECT_DESIGN_LIMIT } from "./project-schemas";
import type { Design, DesignProject } from "./types";

export { MIN_SET_SIZE, PROJECT_DESIGN_LIMIT };

// What a project lets the customer do (docs 12 BR-17, BR-19, BR-22), as pure functions: screens
// render these answers instead of scattering status checks. Client-side gating only: the server
// decides and re-checks every move.

/** One gate: may the customer do it, and if not, why (shown next to the locked control). */
export type Gate = { allowed: boolean; reason?: string };

export type ProjectActions = {
  createDesign: Gate;
  addDesign: Gate;
  archive: Gate;
  submitSet: Gate;
};

const ALLOWED: Gate = { allowed: true };
const refuse = (reason: string): Gate => ({ allowed: false, reason });

const REASONS = {
  closed: "Dự án đã đóng",
  full: `Dự án đã đủ ${PROJECT_DESIGN_LIMIT} bản`,
  pending: "Còn bản đang chờ duyệt",
  tooSmall: `Cần ít nhất ${MIN_SET_SIZE} bản nháp để gửi cả bộ`,
  designPending: "Bản đang chờ duyệt, chưa thể gỡ",
} as const;

/**
 * The actions of one project, given the designs it holds (ARCHIVED ones do not count, docs 12
 * §4.9.27). An ARCHIVED project allows nothing (BR-22); an open one takes up to 20 designs; it
 * closes only with no design under review (BR-22); a set needs 2 DRAFT designs (BR-19).
 */
export function projectActions(
  project: Pick<DesignProject, "status">,
  designs: readonly Pick<Design, "status">[],
): ProjectActions {
  if (project.status === "ARCHIVED") {
    const closed = refuse(REASONS.closed);
    return { createDesign: closed, addDesign: closed, archive: closed, submitSet: closed };
  }
  const live = designs.filter((design) => design.status !== "ARCHIVED");
  const room = live.length < PROJECT_DESIGN_LIMIT ? ALLOWED : refuse(REASONS.full);
  const drafts = live.filter((design) => design.status === "DRAFT").length;
  return {
    createDesign: room,
    addDesign: room,
    archive: live.some((design) => design.status === "PENDING_REVIEW")
      ? refuse(REASONS.pending)
      : ALLOWED,
    submitSet: drafts >= MIN_SET_SIZE ? ALLOWED : refuse(REASONS.tooSmall),
  };
}

/**
 * docs 12 BR-17: a design under review cannot leave its project. A closed project keeps its
 * designs (BR-22; the mock and the server refuse with DESIGN_PROJECT_ARCHIVED).
 */
export function canRemoveFromProject(design: Pick<Design, "status" | "project">): Gate {
  if (design.project?.status === "ARCHIVED") return refuse(REASONS.closed);
  return design.status === "PENDING_REVIEW" ? refuse(REASONS.designPending) : ALLOWED;
}

/**
 * Where an open project stands on its way to a quote (UI/UX 27/11, sf-12): "design" while its
 * designs are being made (drafts, or none yet), "review" while some wait on the shop's review
 * (docs 12 BR-19), "quote" once one is approved, which is what a project quote is asked over
 * (docs 12 §4.11). An approved design wins over one still under review: the customer can ask now.
 */
export type ProjectStage = "design" | "review" | "quote";

export const PROJECT_STAGES: readonly { id: ProjectStage; label: string }[] = [
  { id: "design", label: "Thiết kế" },
  { id: "review", label: "Duyệt" },
  { id: "quote", label: "Báo giá" },
];

export function projectStage(designs: readonly Pick<Design, "status">[]): ProjectStage {
  if (designs.some((design) => design.status === "APPROVED")) return "quote";
  if (designs.some((design) => design.status === "PENDING_REVIEW")) return "review";
  return "design";
}
