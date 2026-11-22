import { StorefrontShell } from "@/components/storefront/storefront-shell";

import type { ReactNode } from "react";

/**
 * One conversation (`/chat/[id]`) is a full-height app screen: the storefront header, then the thread down to the
 * bottom of the window. No footer and no trust strip, which squeezed the messages to a few lines (L-10). It sits beside
 * `(storefront)/chat` (the list and "new"), under the same `/chat` path, as `(studio)` does for `/design`.
 */
export default function ChatThreadLayout({ children }: { children: ReactNode }) {
  return <StorefrontShell footer={false}>{children}</StorefrontShell>;
}
