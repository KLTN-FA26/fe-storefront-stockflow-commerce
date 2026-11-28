"use client";

import { useState } from "react";
import Link from "next/link";
import { MessageCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  isKnownOffer,
  isShortageOpen,
  shortageBatchText,
  shortageEffectLines,
  shortageOptionLabel,
  type ShortageCard,
  type KnownShortageOffer,
  type ShortageOption,
} from "@/lib/domain/shortage";
import { formatDateTime } from "@/lib/format/date";
import { formatNumber } from "@/lib/format/number";

import { ShortageChoiceDialog } from "./shortage-choice-dialog";

interface ShortageChoicePanelProps {
  card: ShortageCard;
  /** The customer may choose here (the card's `CHOOSE` action in chat, the order's UPDATE permission on the page). */
  canChoose: boolean;
  pending: boolean;
  error: string | null;
  /** Sends the choice; `onDone` closes the confirmation once it went through. */
  onChoose: (input: { option: ShortageOption; note: string }, onDone: () => void) => void;
  onClearError?: (() => void) | undefined;
  /** Where "Mở chat với Sale" leads; left out where the customer is already in the chat. */
  chatHref?: string | undefined;
}

/** What the card says once nothing is left to choose (17 §5.6): the customer's pick, or why it ended. */
function ClosedNote({ card }: { card: ShortageCard }) {
  const picked = card.chosen ? shortageOptionLabel(card.chosen.option) : null;
  switch (card.status) {
    case "ANSWERED":
      return picked && card.chosen ? (
        <p className="text-ink-primary font-medium">
          Anh/chị đã chọn: {picked} lúc {formatDateTime(card.chosen.at)} — Sale sẽ thực hiện.
        </p>
      ) : null;
    case "EXECUTED":
      return (
        <p className="text-ink-primary font-medium">
          Sale đã thực hiện: {picked ?? "hướng đã chọn"}.
        </p>
      );
    case "SUPERSEDED":
      return <p className="text-ink-secondary">Đã có thẻ mới thay thế.</p>;
    case "EXPIRED":
      return (
        <p className="text-ink-secondary">
          Không cần chọn nữa{card.endedReason === "REALLOCATED" ? " — đơn đã đủ hàng" : ""}.
        </p>
      );
    default:
      return null;
  }
}

/**
 * The body of the shortage choice card, in the chat and on the order page: the batch, the lines short, and one large
 * button per way offered with its money / date effect; once answered, executed, replaced or ended, the state in words
 * and no buttons (17 §4.14 step 55-60). Never an LPN, bin, hold reason or internal note.
 */
export function ShortageChoicePanel({
  card,
  canChoose,
  pending,
  error,
  onChoose,
  onClearError,
  chatHref,
}: ShortageChoicePanelProps) {
  const [picked, setPicked] = useState<KnownShortageOffer | null>(null);
  const open = isShortageOpen(card);
  const closePicker = () => {
    setPicked(null);
    onClearError?.();
  };

  return (
    <div className="space-y-3 text-sm">
      <p className="text-ink-secondary tabular-nums">
        {card.orderNumber ? (
          <>
            Đơn <span className="text-ink-primary font-mono font-semibold">{card.orderNumber}</span>
            {" · "}
          </>
        ) : null}
        {shortageBatchText(card.batch)}
      </p>
      <ul aria-label="Các mặt hàng thiếu" className="divide-border-default divide-y">
        {card.lines.map((line) => (
          <li key={line.sku} className="flex items-start justify-between gap-3 py-2">
            <div className="min-w-0">
              <p className="text-ink-primary font-medium break-words">{line.skuName || line.sku}</p>
              {line.skuName ? (
                <p className="text-ink-tertiary font-mono text-xs break-all">{line.sku}</p>
              ) : null}
            </div>
            <p className="text-ink-secondary shrink-0 text-right text-xs tabular-nums">
              Đợt này {formatNumber(line.batchCartons)} · Đã có{" "}
              {formatNumber(line.availableCartons)} ·{" "}
              <span className="text-ink-primary font-semibold">
                Thiếu {formatNumber(line.missingCartons)}
              </span>
            </p>
          </li>
        ))}
      </ul>
      {card.salesNote ? (
        <p className="bg-bg-subtle text-ink-primary rounded-[var(--r-md)] p-3 break-words">
          <span className="text-ink-secondary">Sale nhắn: </span>
          {card.salesNote}
        </p>
      ) : null}
      {open && canChoose ? (
        <ul aria-label="Các hướng xử lý" className="space-y-2">
          {card.options.filter(isKnownOffer).map((offer) => (
            <li key={offer.option}>
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                aria-label={shortageOptionLabel(offer.option)}
                className="h-auto min-h-11 w-full flex-col items-start gap-1 rounded-[var(--r-md)] px-4 py-3 text-left whitespace-normal"
                onClick={() => setPicked(offer)}
              >
                <span className="text-ink-primary font-semibold">
                  {shortageOptionLabel(offer.option)}
                </span>
                {shortageEffectLines(offer, card).map((line) => (
                  <span key={line} className="text-ink-secondary text-xs font-normal">
                    {line}
                  </span>
                ))}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      {open && !canChoose ? (
        <p className="text-ink-secondary">Hãy chat với Sale để chọn hướng xử lý.</p>
      ) : null}
      <ClosedNote card={card} />
      {card.status === "ANSWERED" && card.chosen?.note ? (
        <p className="text-ink-secondary break-words">Lời nhắn của anh/chị: {card.chosen.note}</p>
      ) : null}
      {chatHref ? (
        <Button asChild variant="ghost" className="min-h-11 rounded-[var(--r-md)] px-2">
          <Link href={chatHref}>
            <MessageCircle aria-hidden className="mr-2 size-4" />
            Mở chat với Sale
          </Link>
        </Button>
      ) : null}
      <ShortageChoiceDialog
        offer={picked}
        card={card}
        pending={pending}
        error={error}
        onCancel={closePicker}
        onConfirm={(note) =>
          picked ? onChoose({ option: picked.option, note }, closePicker) : undefined
        }
      />
    </div>
  );
}
