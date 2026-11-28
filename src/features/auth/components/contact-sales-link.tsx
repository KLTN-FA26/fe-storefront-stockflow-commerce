import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { APP_ROUTES } from "@/constants";

import { CONTACT_SALES_LINK } from "../errors";

/** Under a text that says "liên hệ Sales": the form that reaches them, since a visitor has no other way in. */
export function ContactSalesLink() {
  return (
    <Link
      href={APP_ROUTES.openAccount}
      className="text-accent focus-visible:ring-accent inline-flex min-h-11 items-center gap-1.5 rounded-sm text-sm font-medium hover:underline focus-visible:ring-2 focus-visible:outline-none"
    >
      {CONTACT_SALES_LINK}
      <ArrowRight aria-hidden className="size-4" />
    </Link>
  );
}
