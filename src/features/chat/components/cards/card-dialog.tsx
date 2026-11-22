"use client";

import type { FormEventHandler, ReactNode } from "react";

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

interface CardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirm: string;
  pending: boolean;
  /** The confirm button waits for something besides the send (e.g. the pricing still loading). */
  confirmDisabled?: boolean;
  /** Why the last attempt failed, kept in the dialog so the customer can fix it and retry. */
  error: string | null;
  onSubmit: FormEventHandler<HTMLFormElement>;
  children: ReactNode;
}

/** A form dialog for a card action (accept a quote, ask for changes). */
export function CardDialog({
  open,
  onOpenChange,
  title,
  description,
  confirm,
  pending,
  confirmDisabled = false,
  error,
  onSubmit,
  children,
}: CardDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="border-border-default bg-bg-surface gap-0 rounded-[var(--r-xl)] border p-0 shadow-[var(--sh-lg)] ring-0 sm:max-w-md"
      >
        <form onSubmit={onSubmit} noValidate>
          <DialogHeader className="border-border-default border-b px-[var(--card-pad)] py-4">
            <DialogTitle className="text-ink-primary font-display text-lg leading-tight font-semibold">
              {title}
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-[60dvh] space-y-4 overflow-y-auto p-[var(--card-pad)]">
            <DialogDescription className="text-ink-secondary text-sm leading-relaxed">
              {description}
            </DialogDescription>
            {children}
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
              className="min-h-11 rounded-[var(--r-md)] px-4"
              onClick={() => onOpenChange(false)}
            >
              Quay lại
            </Button>
            <Button
              type="submit"
              disabled={pending || confirmDisabled}
              className="min-h-11 rounded-[var(--r-md)] px-4"
            >
              {pending ? "Đang gửi..." : confirm}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
