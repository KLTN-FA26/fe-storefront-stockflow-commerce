"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";

import { Alert } from "@/components/shared";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  SHORTAGE_NOTE_MAX,
  shortageChoiceNoteSchema,
  shortageEffectLines,
  shortageOptionLabel,
  type ShortageCard,
  type KnownShortageOffer,
} from "@/lib/domain/shortage";

type NoteForm = z.input<typeof shortageChoiceNoteSchema>;

interface ShortageChoiceDialogProps {
  /** The way the customer pressed; null while the dialog is closed. */
  offer: KnownShortageOffer | null;
  card: ShortageCard;
  pending: boolean;
  /** Why the last attempt failed, kept in the dialog so the customer can read it and retry. */
  error: string | null;
  onCancel: () => void;
  onConfirm: (note: string) => void;
}

/**
 * "Xác nhận chọn: …" (17 §4.14 step 57): restates what the way costs or changes, takes an optional message
 * for Sales, and sends once. The choice cannot be taken back, so it is never sent by the first press.
 */
export function ShortageChoiceDialog({
  offer,
  card,
  pending,
  error,
  onCancel,
  onConfirm,
}: ShortageChoiceDialogProps) {
  const { register, handleSubmit, reset, formState } = useForm<NoteForm>({
    resolver: zodResolver(shortageChoiceNoteSchema),
    defaultValues: { note: "" },
  });
  const open = offer !== null;
  useEffect(() => {
    if (open) reset({ note: "" });
  }, [open, reset]);
  const noteId = `shortage-note-${card.cardId}`;
  const noteError = formState.errors.note?.message;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !pending && onCancel()}>
      <DialogContent
        showCloseButton={false}
        className="border-border-default bg-bg-surface gap-0 rounded-[var(--r-xl)] border p-0 shadow-[var(--sh-lg)] ring-0 sm:max-w-md"
      >
        <form
          noValidate
          onSubmit={handleSubmit((values) => onConfirm(values.note ?? ""))}
          aria-label="Xác nhận chọn hướng xử lý"
        >
          <DialogHeader className="border-border-default border-b px-[var(--card-pad)] py-4">
            <DialogTitle className="text-ink-primary font-display text-lg leading-tight font-semibold">
              Xác nhận chọn: {offer ? shortageOptionLabel(offer.option) : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-[60dvh] space-y-4 overflow-y-auto p-[var(--card-pad)]">
            <DialogDescription className="text-ink-secondary text-sm leading-relaxed">
              Mỗi thẻ chỉ chọn được một lần. Sale sẽ thực hiện đúng hướng này cho đơn.
            </DialogDescription>
            {offer ? (
              <ul className="text-ink-primary space-y-1 text-sm">
                {shortageEffectLines(offer, card).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ) : null}
            <div className="space-y-1.5">
              <Label htmlFor={noteId} className="text-sm font-medium">
                Lời nhắn cho Sale (không bắt buộc)
              </Label>
              <Textarea
                id={noteId}
                rows={3}
                maxLength={SHORTAGE_NOTE_MAX}
                aria-invalid={noteError ? true : undefined}
                {...register("note")}
              />
              {noteError ? (
                <p role="alert" className="text-danger text-sm">
                  {noteError}
                </p>
              ) : null}
            </div>
            {error ? (
              <div role="alert">
                <Alert tone="danger" title="Không thực hiện được.">
                  {error}
                </Alert>
              </div>
            ) : null}
          </div>
          <DialogFooter className="border-border-default bg-bg-subtle mx-0 mb-0 rounded-b-[var(--r-xl)] border-t px-[var(--card-pad)] py-3">
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              className="min-h-11 rounded-[var(--r-md)] px-4"
              onClick={onCancel}
            >
              Xem lại
            </Button>
            <Button
              type="submit"
              disabled={pending}
              className="min-h-11 rounded-[var(--r-md)] px-4"
            >
              {pending ? "Đang gửi..." : "Xác nhận chọn"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
