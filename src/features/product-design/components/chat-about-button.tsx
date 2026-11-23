"use client";

import Link from "next/link";
import { MessageCircle } from "lucide-react";

import { CHAT_WITH_SALES, STORE_ROUTES } from "@/constants";
import { Button } from "@/components/ui/button";
import { PERM } from "@/lib/auth/permission-codes";
import { useHasPermission } from "@/lib/auth/my-permissions";
import { cn } from "@/lib/cn";

import { ACTION_BUTTON } from "./quote-request-parts";

/**
 * "Chat với Sale" about one design or one project (plan E1; WF-02 audit, item 10): opens — or reuses — the
 * conversation with that document as its context (BE C1, the only way a customer attaches one, BR-02). Only for a
 * customer who may open a conversation (`chat-conversations:CREATE`).
 */
export function ChatAboutButton({
  kind,
  id,
  name,
  className,
}: {
  kind: "DESIGN" | "DESIGN_PROJECT";
  id: string;
  /** For the accessible name: which design or project the chat is about. */
  name: string;
  className?: string;
}) {
  const allowed = useHasPermission(PERM.chatCreate);
  if (!allowed) return null;
  return (
    <Button asChild variant="outline" className={cn(ACTION_BUTTON, className)}>
      <Link href={STORE_ROUTES.chat.about(kind, id)} aria-label={`${CHAT_WITH_SALES} về ${name}`}>
        <MessageCircle aria-hidden className="size-4" />
        {CHAT_WITH_SALES}
      </Link>
    </Button>
  );
}
