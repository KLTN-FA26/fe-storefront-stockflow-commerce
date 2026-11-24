import { Skeleton } from "@/components/shared";
import { PageShell } from "@/components/storefront/layout";

import { DesignSectionSwitch } from "./design-section-switch";

/** What each section of the design area says under its title, here and on its screen. */
export const DESIGN_AREA_HEADINGS = {
  designs: {
    title: "Thiết kế của tôi",
    subtitle: "Tiếp tục chỉnh sửa, gửi duyệt và theo dõi các thiết kế của bạn.",
  },
  projects: {
    title: "Dự án thiết kế",
    subtitle: "Gom các bản thiết kế của một bộ sản phẩm và gửi duyệt cả bộ.",
  },
} as const;

/**
 * A section of the design area while it loads, drawn in the frame it will load into: the same title and line, the
 * place of the "new" button, the section switch with this section current, the status tabs and the cards. Switching
 * "Thiết kế của tôi" ⇄ "Dự án" then only fills the list in instead of making the whole page jump.
 */
export function DesignAreaSkeleton({ section }: { section: keyof typeof DESIGN_AREA_HEADINGS }) {
  const { title, subtitle } = DESIGN_AREA_HEADINGS[section];
  return (
    <PageShell
      title={title}
      subtitle={subtitle}
      actions={<Skeleton className="h-11 w-36 rounded-[var(--r-md)]" />}
    >
      <DesignSectionSwitch current={section} />
      <div role="status" aria-label="Đang tải" className="space-y-5">
        <Skeleton className="h-12 w-80 max-w-full rounded-[var(--r-lg)]" />
        <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-80 w-full rounded-[var(--r-lg)]" />
          ))}
        </div>
      </div>
    </PageShell>
  );
}
