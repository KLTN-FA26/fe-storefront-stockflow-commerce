"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageCircle } from "lucide-react";

import { STORE_ROUTES } from "@/constants";

import { Button } from "@/components/ui/button";

/** Floating shortcut to sales chat; hidden on chat pages, where it would cover the composer. */
export function ChatFab() {
  const pathname = usePathname();
  if (pathname?.startsWith(STORE_ROUTES.chat.list)) return null;

  return (
    <div className="fixed right-5 bottom-5 z-50">
      <Button asChild size="icon" variant="secondary" className="size-12 rounded-full shadow-lg">
        <Link href={STORE_ROUTES.chat.list} aria-label="Mở tư vấn">
          <MessageCircle className="size-5" />
        </Link>
      </Button>
    </div>
  );
}
