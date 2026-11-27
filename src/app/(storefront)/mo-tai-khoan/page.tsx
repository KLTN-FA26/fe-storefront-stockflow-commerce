import type { Metadata } from "next";

import { OpenAccountScreen } from "@/features/lead";

export const metadata: Metadata = { title: "Mở tài khoản doanh nghiệp" };

/** Public (session guard: PUBLIC_PATHS): a business that is not a customer yet asks Sales for an account. */
export default function OpenAccountPage() {
  return <OpenAccountScreen />;
}
