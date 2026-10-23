"use client";

import { Copy } from "lucide-react";

import { toast } from "@/components/shared/Toast";
import { Button } from "@/components/ui/button";

interface CopyFieldButtonProps {
  /** What goes on the clipboard. */
  value: string;
  /** Names the field for the accessible label and the toast, e.g. "số tài khoản". */
  fieldName: string;
}

/** A one-tap copy for something the customer must type elsewhere (a bank app). */
export function CopyFieldButton({ value, fieldName }: CopyFieldButtonProps) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`Đã sao chép ${fieldName}`);
    } catch {
      // Clipboard can be blocked (insecure origin, permissions); the text stays visible to type.
      toast.error(`Không sao chép được ${fieldName}`, "Bạn có thể chọn và sao chép thủ công.");
    }
  };

  return (
    <Button
      type="button"
      variant="ghost"
      className="text-ink-secondary hover:text-ink-primary min-h-11 min-w-11 shrink-0 rounded-full"
      onClick={() => void copy()}
      aria-label={`Sao chép ${fieldName}`}
    >
      <Copy aria-hidden className="size-4" />
    </Button>
  );
}
