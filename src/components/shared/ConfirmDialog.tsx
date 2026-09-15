"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Nếu true, hiện ô nhập lý do bắt buộc trước khi cho confirm. */
  requireReason?: boolean;
  reasonLabel?: string;
  onConfirm: (reason?: string) => void;
  variant?: "danger" | "default";
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Xác nhận",
  cancelLabel = "Quay lại",
  requireReason = false,
  reasonLabel = "Lý do",
  onConfirm,
  variant = "danger",
}: ConfirmDialogProps) {
  const [reason, setReason] = useState("");
  const canConfirm = !requireReason || reason.trim().length > 0;

  const handleConfirm = () => {
    if (!canConfirm) return;
    onConfirm(requireReason ? reason : undefined);
    setReason("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) setReason(""); onOpenChange(v); }}>
      <DialogContent
        showCloseButton={false}
        className="gap-0 sm:max-w-[440px] rounded-[var(--r-xl)] border border-border-default bg-bg-surface p-0 shadow-[var(--sh-lg)] ring-0"
      >
        <DialogHeader className="border-b border-border-default px-[18px] py-4">
          <DialogTitle className="font-[family-name:var(--font-display)] text-[1.05rem] font-semibold leading-tight text-ink-primary">
            {title}
          </DialogTitle>
        </DialogHeader>

        <div className="px-[18px] py-[18px] space-y-3">
          <DialogDescription className="text-[0.875rem] leading-relaxed text-ink-secondary">
            {description}
          </DialogDescription>

          {requireReason && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="confirm-reason" className="text-xs font-medium text-ink-secondary">
                {reasonLabel} <span className="text-danger">*</span>
              </Label>
              <Input
                id="confirm-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Nhập lý do…"
                autoFocus
                className="border-border-default bg-bg-surface text-ink-primary placeholder:text-ink-tertiary focus:border-accent"
              />
            </div>
          )}
        </div>

        <DialogFooter className="mx-0 mb-0 rounded-b-[var(--r-xl)] border-t border-border-default bg-bg-subtle px-[18px] py-[14px]">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => { setReason(""); onOpenChange(false); }}
            className="rounded-[var(--r-sm)] border-border-strong bg-bg-surface text-ink-primary hover:bg-bg-muted"
          >
            {cancelLabel}
          </Button>
          <Button variant="ghost"
            type="button"
            size="sm"
            disabled={!canConfirm}
            onClick={handleConfirm}
            className={
              variant === "danger"
                ? "rounded-[var(--r-sm)] bg-danger text-white hover:bg-danger/90 disabled:opacity-50"
                : "rounded-[var(--r-sm)] bg-brand !text-ink-inverse hover:bg-brand-hover hover:!text-ink-inverse disabled:opacity-50"
            }
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
