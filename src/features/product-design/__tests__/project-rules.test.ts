import { describe, expect, it } from "vitest";

import { canRemoveFromProject, projectActions, PROJECT_DESIGN_LIMIT } from "../project-rules";
import { designProjectSchema } from "../project-schemas";
import { design } from "./fixtures";
import { projectDto } from "./project-fixtures";

const project = (overrides: Record<string, unknown> = {}) =>
  designProjectSchema.parse(projectDto(overrides));
const drafts = (n: number) =>
  Array.from({ length: n }, (_, i) =>
    design({ id: `7c1f0a00-0000-4000-8000-0000000001${i + 10}` }),
  );

describe("projectActions", () => {
  it("lets an ACTIVE project with room create, add and archive, and sends a set of 2 drafts", () => {
    expect(projectActions(project(), drafts(2))).toEqual({
      createDesign: { allowed: true },
      addDesign: { allowed: true },
      archive: { allowed: true },
      submitSet: { allowed: true },
    });
  });

  it("locks everything on an ARCHIVED project and says it is closed", () => {
    const actions = projectActions(project({ status: "ARCHIVED" }), drafts(3));
    for (const gate of Object.values(actions)) {
      expect(gate).toEqual({ allowed: false, reason: "Dự án đã đóng" });
    }
  });

  it("locks create and add at 20 designs, ARCHIVED ones not counted", () => {
    const full = [...drafts(PROJECT_DESIGN_LIMIT)];
    expect(projectActions(project(), full).createDesign).toEqual({
      allowed: false,
      reason: "Dự án đã đủ 20 bản",
    });
    expect(projectActions(project(), full).addDesign.allowed).toBe(false);
    expect(projectActions(project(), full).archive.allowed).toBe(true);

    const withArchived = [...drafts(19), design({ status: "ARCHIVED" })];
    expect(projectActions(project(), withArchived).createDesign.allowed).toBe(true);
  });

  it("blocks archive while a design awaits review, and the set needs 2 DRAFT designs", () => {
    const list = [design({ status: "PENDING_REVIEW" }), ...drafts(1)];
    const actions = projectActions(project(), list);
    expect(actions.archive).toEqual({ allowed: false, reason: "Còn bản đang chờ duyệt" });
    expect(actions.submitSet).toEqual({
      allowed: false,
      reason: "Cần ít nhất 2 bản nháp để gửi cả bộ",
    });
    expect(actions.createDesign.allowed).toBe(true);
  });

  it("does not count APPROVED or PENDING_REVIEW designs as drafts for the set", () => {
    const list = [
      ...drafts(1),
      design({ status: "APPROVED" }),
      design({ status: "PENDING_REVIEW" }),
    ];
    expect(projectActions(project(), list).submitSet.allowed).toBe(false);
  });

  it("answers an empty project", () => {
    const actions = projectActions(project(), []);
    expect(actions.createDesign.allowed).toBe(true);
    expect(actions.archive.allowed).toBe(true);
    expect(actions.submitSet.allowed).toBe(false);
  });
});

describe("canRemoveFromProject", () => {
  it("allows a DRAFT or APPROVED design", () => {
    expect(canRemoveFromProject(design({ status: "DRAFT" }))).toEqual({ allowed: true });
    expect(canRemoveFromProject(design({ status: "APPROVED" })).allowed).toBe(true);
  });

  it("refuses any design of a closed project, as the server does", () => {
    const closed = { id: design().id, name: "B", status: "ARCHIVED" as const };
    expect(canRemoveFromProject(design({ status: "DRAFT", project: closed }))).toEqual({
      allowed: false,
      reason: "Dự án đã đóng",
    });
    const open = { ...closed, status: "ACTIVE" as const };
    expect(canRemoveFromProject(design({ status: "DRAFT", project: open })).allowed).toBe(true);
  });

  it("refuses a design under review, with the reason", () => {
    expect(canRemoveFromProject(design({ status: "PENDING_REVIEW" }))).toEqual({
      allowed: false,
      reason: "Bản đang chờ duyệt, chưa thể gỡ",
    });
  });
});
