import { AlertTriangle } from "lucide-react";

interface VariantRecheckProps {
  changed: boolean;
  variantName: string;
}

export function VariantRecheck({ changed, variantName }: VariantRecheckProps) {
  if (!changed) return null;

  return (
    <div className="border-warning/40 bg-warning/10 text-warning flex gap-3 rounded-[var(--r-lg)] border p-[var(--card-pad)]">
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
      <div>
        <p className="font-semibold">Cần kiểm tra lại layout</p>
        <p className="text-ink-secondary text-sm">
          Biến thể {variantName} có thể đổi vùng in, hãy chạy lại preflight trước khi xác nhận.
        </p>
      </div>
    </div>
  );
}
