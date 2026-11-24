import type { ReactNode } from "react";

import { SessionGuard } from "@/features/auth/components/session-guard";
import { MockReviewPanel } from "@/features/product-design/components/mock-review-panel";
import { DesktopOnlyGate } from "@/features/product-design/components/desktop-only-gate";

/**
 * The design studio and its launcher take the whole window: no storefront header, footer or chat
 * button. They sit beside `(storefront)/design` (the list), under the same `/design` path. Both
 * need a computer-sized screen: a narrower one gets a notice instead, without the simulation panel.
 */
export default function StudioLayout({ children }: { children: ReactNode }) {
  return (
    <div className="bg-bg-subtle text-ink-primary flex min-h-dvh flex-col">
      <SessionGuard>
        <DesktopOnlyGate>
          {children}
          <MockReviewPanel placement="studio" />
        </DesktopOnlyGate>
      </SessionGuard>
    </div>
  );
}
