import { STUDIO_FONTS } from "../../../fonts";
import { SubmitSetLoader } from "./submit-set-loader";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Gửi duyệt cả bộ" };

type SearchParams = Record<string, string | string[] | undefined>;

/** Route params arrive percent-encoded; a stray `%` must not crash the page. */
function readId(raw: string) {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** `?ids=a,b,c` (`STORE_ROUTES.design.projectSubmit`): the chosen designs, each once, in order. */
function idsOf(value: string | string[] | undefined): string[] {
  const listed = (Array.isArray(value) ? value : [value ?? ""]).flatMap((text) => text.split(","));
  return [...new Set(listed.map((id) => id.trim()).filter(Boolean))];
}

/**
 * "Gửi duyệt cả bộ" of a project (spec 2026-11-12 §8): in the studio route group (planning
 * decision Q1) for the studio's fonts, which the check and the files are made with, and its
 * computer-only gate.
 */
export default async function SubmitSetPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  return <SubmitSetLoader projectId={readId(id)} ids={idsOf(query.ids)} fonts={STUDIO_FONTS} />;
}
