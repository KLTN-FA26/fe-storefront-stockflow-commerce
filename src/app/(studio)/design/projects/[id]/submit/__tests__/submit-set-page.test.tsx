import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import SubmitSetPage from "../page";

// next/font cannot run under Vitest: the registry is a stand-in.
vi.mock("../../../../fonts", () => ({ STUDIO_FONTS: { families: [] } }));
vi.mock("../submit-set-loader", () => ({
  SubmitSetLoader: ({ projectId, ids }: { projectId: string; ids: string[] }) => (
    <p>{`set of ${projectId}: ${ids.join(" | ")}`}</p>
  ),
}));

const open = async (id: string, searchParams: Record<string, string | string[] | undefined>) =>
  render(
    await SubmitSetPage({
      params: Promise.resolve({ id }),
      searchParams: Promise.resolve(searchParams),
    }),
  );

describe("/design/projects/[id]/submit", () => {
  it("opens the set of the project with the designs of the link, each once, in order", async () => {
    await open("p-1", { ids: "b,a, b ,,c" });
    expect(screen.getByText("set of p-1: b | a | c")).toBeVisible();
  });

  it("reads a repeated parameter and a percent-encoded project id", async () => {
    await open("p%201", { ids: ["a", "b"] });
    expect(screen.getByText("set of p 1: a | b")).toBeVisible();
  });

  it("opens with no designs when the link has none", async () => {
    await open("p-1", {});
    expect(screen.getByText("set of p-1:")).toBeVisible();
  });
});
