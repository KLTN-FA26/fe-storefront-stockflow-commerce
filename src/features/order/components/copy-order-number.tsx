"use client";

import { Copy } from "lucide-react";

import { toast } from "@/components/shared/Toast";
import { Button } from "@/components/ui/button";

/**
 * Customers quote the order number to support. The list card is one big link, so the code is not
 * selectable there; the detail page offers a one-tap copy instead.
 */
export function CopyOrderNumber({ orderNumber }: { orderNumber: string }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(orderNumber);
      toast.success("Đã sao chép mã đơn");
    } catch {
      // Clipboard can be blocked (insecure origin, permissions); the code stays visible to type.
      toast.error("Không sao chép được mã đơn", "Bạn có thể chọn và sao chép mã thủ công.");
    }
  };

  return (
    <Button
      type="button"
      variant="ghost"
      className="text-ink-secondary hover:text-ink-primary min-h-11 min-w-11 rounded-full"
      onClick={() => void copy()}
      aria-label={`Sao chép mã đơn ${orderNumber}`}
    >
      <Copy aria-hidden className="size-4" />
    </Button>
  );
}
