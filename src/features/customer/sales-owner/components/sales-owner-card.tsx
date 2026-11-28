"use client";

import { useState } from "react";
import Link from "next/link";
import { MessageCircle, UserRound } from "lucide-react";

import { CHAT_WITH_SALES, STORE_ROUTES } from "@/constants";
import { SurfaceCard } from "@/components/storefront/layout";
import { Button } from "@/components/ui/button";
import { useSignedIn } from "@/lib/auth/use-signed-in";

import { canRequestChange, shownOwner } from "../lifecycle";
import { useMyOwnerChangeRequests, useMySalesOwner } from "../queries";
import { ChangeRequestDialog } from "./change-request-dialog";
import { ChangeRequestStatus } from "./change-request-status";

const BUTTON = "min-h-11 rounded-[var(--r-md)] px-4";

/**
 * "Sale phụ trách của bạn" (KE-HOACH sales owner §10.5): the one Sales who looks after the company, and who answers
 * for them while they are away. No staff e-mail or phone: the customer reaches them through the chat. The customer
 * may ask a Sales Manager for another person; the card shows where the latest request stands. Left out when the
 * customer has no Sales or the BE does not offer it yet; the request part when its endpoint is not there.
 */
export function SalesOwnerCard() {
  const signedIn = useSignedIn() === true;
  const owner = shownOwner(useMySalesOwner(signedIn).data);
  const requests = useMyOwnerChangeRequests(signedIn && owner !== null);
  const [open, setOpen] = useState(false);
  if (!owner) return null;

  const requestsAvailable = Array.isArray(requests.data);
  const latest = requests.data?.[0];

  return (
    <SurfaceCard>
      <section aria-labelledby="sales-owner-heading" className="grid gap-4">
        <h2
          id="sales-owner-heading"
          className="font-display text-ink-primary text-base font-semibold"
        >
          Sale phụ trách của bạn
        </h2>
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="bg-accent/10 text-accent flex size-11 shrink-0 items-center justify-center rounded-full"
          >
            <UserRound className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="text-ink-primary font-medium break-words">{owner.name}</p>
            {owner.cover ? (
              <p className="text-ink-secondary text-sm break-words">
                (đang có {owner.cover} hỗ trợ thay)
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Button asChild className={BUTTON}>
            <Link href={STORE_ROUTES.chat.new}>
              <MessageCircle aria-hidden className="mr-2 size-4" />
              {CHAT_WITH_SALES}
            </Link>
          </Button>
          {requestsAvailable && canRequestChange(latest) ? (
            <Button
              type="button"
              variant="outline"
              className={BUTTON}
              onClick={() => setOpen(true)}
            >
              Yêu cầu đổi người hỗ trợ
            </Button>
          ) : null}
        </div>
        {requestsAvailable && latest ? <ChangeRequestStatus request={latest} /> : null}
      </section>
      {requestsAvailable ? <ChangeRequestDialog open={open} onOpenChange={setOpen} /> : null}
    </SurfaceCard>
  );
}
